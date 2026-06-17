/**
 * viz · Ko-fi supporters webhook
 *
 * Ko-fi POSTs application/x-www-form-urlencoded with a single `data` field
 * that holds the payment as a JSON string. We verify the token, accumulate
 * an all-time total per supporter (keyed by a hash of their email so repeat
 * donations stack and renames don't split them), and publish a public,
 * PII-free document the static /supporters page reads live.
 *
 * The leaderboard "drama": on each donation we compare the supporter's rank
 * before vs after and write meta/ticker so the page can flash a GOAL! banner.
 */
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { BigQuery } = require("@google-cloud/bigquery");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// Set with:  firebase functions:secrets:set KOFI_VERIFICATION_TOKEN
const KOFI_TOKEN = defineSecret("KOFI_VERIFICATION_TOKEN");

const FLAG_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
const URL_RE = /https?:\/\/[^\s]+/i;

// 🇨🇴 -> "co" (we render flags as flagcdn images, like the rest of the site,
// since flag emoji don't render on Windows browsers).
function flagToIso(s) {
  const m = s && s.match(FLAG_RE);
  if (!m) return null;
  const iso = [...m[0]]
    .map((c) => String.fromCharCode(c.codePointAt(0) - 0x1f1e6 + 65))
    .join("")
    .toLowerCase();
  return /^[a-z]{2}$/.test(iso) ? iso : null;
}

function firstUrl(s) {
  const m = s && s.match(URL_RE);
  if (!m) return null;
  return m[0].replace(/[).,]+$/, "").slice(0, 200);
}

function cleanName(s) {
  if (!s) return "Anonymous";
  const n = s.replace(FLAG_RE, "").replace(/https?:\/\/\S+/gi, "").trim().slice(0, 40);
  return n || "Anonymous";
}

exports.kofi = onRequest(
  { secrets: [KOFI_TOKEN], region: "us-east1", cors: false },
  async (req, res) => {
    try {
      if (req.method !== "POST") return res.status(405).send("POST only");

      const raw = req.body && req.body.data;
      if (!raw) return res.status(400).send("missing data");

      let p;
      try {
        p = JSON.parse(raw);
      } catch (e) {
        return res.status(400).send("bad json");
      }

      if (p.verification_token !== KOFI_TOKEN.value()) {
        return res.status(401).send("bad token");
      }

      const amount = parseFloat(p.amount) || 0;
      const currency = p.currency || "USD";
      const isPublic = p.is_public !== false; // hide identity unless explicitly public
      const email = (p.email || "").trim().toLowerCase();
      const key = email
        ? "e" + crypto.createHash("sha256").update(email).digest("hex").slice(0, 24)
        : "t" + (p.kofi_transaction_id || crypto.randomBytes(8).toString("hex"));

      const msg = isPublic ? p.message || "" : "";
      const iso = isPublic ? flagToIso(msg) : null;
      const social = isPublic ? firstUrl(msg) : null;
      const name = isPublic ? cleanName(p.from_name) : "Anonymous";

      const ref = db.collection("supporters").doc(key);

      // Accumulate the total atomically; keep last-known flag/social if this
      // donation didn't include new ones.
      const { oldTotal, newTotal, first } = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prev = snap.exists ? snap.data() : {};
        const ot = prev.total || 0;
        const nt = ot + amount;
        tx.set(
          ref,
          {
            name,
            flag: iso || prev.flag || null,
            social: social || prev.social || null,
            total: nt,
            currency,
            count: admin.firestore.FieldValue.increment(1),
            anon: !isPublic,
            hidden: prev.hidden || false,
            firstAt: prev.firstAt || admin.firestore.FieldValue.serverTimestamp(),
            lastAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return { oldTotal: ot, newTotal: nt, first: !snap.exists };
      });

      // Rank = 1 + (number of supporters with a strictly higher total).
      // After the write, count(total > oldTotal) includes this supporter, so it
      // equals their previous rank; count(total > newTotal) excludes them.
      const higherOld = (await db.collection("supporters").where("total", ">", oldTotal).count().get()).data().count;
      const higherNew = (await db.collection("supporters").where("total", ">", newTotal).count().get()).data().count;
      const oldRank = higherOld;
      const newRank = higherNew + 1;
      const jump = Math.max(0, oldRank - newRank);

      await db.collection("meta").doc("ticker").set({
        name,
        flag: iso || null,
        amount,
        currency,
        toRank: newRank,
        jump,
        first,
        anon: !isPublic,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).send("ok");
    } catch (err) {
      console.error("kofi webhook error", err);
      return res.status(500).send("error");
    }
  }
);

/* ───────────────────────────────────────────────────────────────────────
 * viz · visitor heatmap
 *
 * Mirrors Severo's country map (LanguageProject/functions/country_stats.js)
 * but counts *visitors* to this notebook, not engaged app users.
 *
 * GA4 streams page_view events into the BigQuery export dataset for this
 * Firebase project. A nightly job tallies COUNT(DISTINCT user_pseudo_id)
 * by geo.country across ALL exported days (all-time, cumulative — the
 * notebook is new and the story is "everyone who's ever wandered through"),
 * then writes one tiny, PII-free aggregate doc to Firestore. The main page
 * reads that doc directly from the client (public read; see firestore.rules)
 * — no serving function needed, same pattern as the supporters board.
 * ─────────────────────────────────────────────────────────────────────── */

// GA4 export dataset for the GA4 property linked to this project. New daily
// tables appear as events_YYYYMMDD (and events_intraday_* while a day is in
// flight); the events_* wildcard sweeps them all and DISTINCT dedupes any
// overlap. Find this id in BigQuery if the GA4 property is ever relinked.
const GA4_DATASET = "analytics_541579771";
const VISITOR_DOC_PATH = "public_stats/visitor_heatmap";

const bigquery = new BigQuery();

async function computeVisitorStats() {
  const query = `
    SELECT
      geo.country AS country,
      COUNT(DISTINCT user_pseudo_id) AS visitors
    FROM \`${GA4_DATASET}.events_*\`
    WHERE event_name = "page_view"
      AND geo.country IS NOT NULL
      AND geo.country != ""
      AND geo.country != "(not set)"
    GROUP BY country
    ORDER BY visitors DESC
  `;

  const [rows] = await bigquery.query({ query, useLegacySql: false });

  const countries = {};
  let totalVisitors = 0;
  for (const row of rows) {
    const name = row.country;
    const visitors = Number(row.visitors) || 0;
    if (!name || visitors <= 0) continue;
    countries[name] = visitors;
    totalVisitors += visitors;
  }

  return {
    countries,
    totalCountries: Object.keys(countries).length,
    totalVisitors,
    updatedAt: new Date().toISOString(),
  };
}

// Nightly at 03:30 UTC (after GA4's daily export, which lands a few hours
// after midnight in the property's timezone).
exports.updateVisitorStats = onSchedule(
  {
    schedule: "30 3 * * *",
    timeZone: "UTC",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async () => {
    const stats = await computeVisitorStats();
    await db.doc(VISITOR_DOC_PATH).set(stats);
    console.log(
      `[visitor-stats] wrote ${stats.totalCountries} countries, ` +
        `${stats.totalVisitors} visitors (all-time)`
    );
  }
);

// Manual trigger so the doc can be populated immediately after deploy
// instead of waiting for the nightly run. Protect with a token set via:
//   firebase functions:secrets:set VISITOR_STATS_ADMIN_TOKEN
const VISITOR_TOKEN = defineSecret("VISITOR_STATS_ADMIN_TOKEN");

exports.refreshVisitorStatsNow = onRequest(
  { secrets: [VISITOR_TOKEN], cors: false, timeoutSeconds: 120, memory: "256MiB" },
  async (req, res) => {
    const token = req.query.token || req.headers["x-admin-token"];
    if (!token || token !== VISITOR_TOKEN.value()) {
      return res.status(403).json({ error: "forbidden" });
    }
    try {
      const stats = await computeVisitorStats();
      await db.doc(VISITOR_DOC_PATH).set(stats);
      return res.json({ ok: true, ...stats });
    } catch (err) {
      console.error("[visitor-stats] manual refresh error:", err);
      return res.status(500).json({ error: err.message || "internal" });
    }
  }
);
