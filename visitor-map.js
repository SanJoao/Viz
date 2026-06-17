/* viz · visitor heatmap (main notebook page)
 *
 * A small Equal-Earth world map, themed as a paper inset: countries are
 * tinted in ballpoint-blue ink the more visitors they've sent, borders are
 * pencil, and the reader's own country (best-guess from their timezone) is
 * outlined in red marker with a "you" note — so the notebook quietly shows
 * who's been flipping through it.
 *
 * Data is the all-time visitor tally written nightly to Firestore by the
 * updateVisitorStats Cloud Function (see functions/index.js). We read that
 * one doc directly from the client — public read, same as the supporters
 * board. d3 + topojson + the world atlas load lazily from jsDelivr.
 *
 * Local preview: opened off Firebase Hosting (file:// or a plain dev server)
 * the Firebase SDK can't load, so the map falls back to a baked-in SAMPLE of
 * real numbers. Append ?mock=1 to force the sample anywhere.
 */
(function () {
  const VISITOR_DOC_PATH = "public_stats/visitor_heatmap";
  const TOPOJSON_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
  const D3_URL = "https://cdn.jsdelivr.net/npm/d3@7";
  const TOPOJSON_CLIENT_URL = "https://cdn.jsdelivr.net/npm/topojson-client@3";
  const FIREBASE_V = "10.14.1";

  const forceMock = new URLSearchParams(location.search).get("mock") === "1";

  // Baked-in real numbers (all-time, captured at build) so the panel always
  // renders something in local preview. Production reads live Firestore.
  const SAMPLE = {
    countries: {
      "United States": 301, "United Kingdom": 105, "Canada": 59, "Australia": 30,
      "Netherlands": 20, "Ireland": 17, "Germany": 17, "Switzerland": 16,
      "Poland": 12, "Mexico": 10, "Spain": 10, "France": 10, "Colombia": 10,
      "Sweden": 6, "Argentina": 6, "Brazil": 6, "Italy": 5, "India": 4,
      "Japan": 3, "Norway": 3, "Trinidad & Tobago": 3, "Singapore": 3,
      "Hong Kong": 2, "Portugal": 2, "Israel": 2, "Denmark": 2,
      "United Arab Emirates": 1, "Türkiye": 1, "Guam": 1, "New Zealand": 1,
      "Greece": 1, "South Korea": 1, "Iran": 1, "South Africa": 1,
      "Indonesia": 1, "Romania": 1, "El Salvador": 1, "Taiwan": 1, "Zambia": 1,
      "Hungary": 1, "Estonia": 1, "Albania": 1, "Malaysia": 1, "Ukraine": 1,
      "Czechia": 1, "Chile": 1, "Guatemala": 1,
    },
    totalCountries: 47,
    totalVisitors: 684,
  };

  // GA4 `geo.country` values that don't exactly match Natural Earth
  // `properties.name` in world-atlas/countries-110m.json. Extend as new
  // mismatches show up in the data.
  const NAME_ALIASES = {
    "United States": "United States of America",
    "Czechia": "Czech Republic",
    "Türkiye": "Turkey",
    "Trinidad & Tobago": "Trinidad and Tobago",
    "Myanmar (Burma)": "Myanmar",
    "Côte d’Ivoire": "Ivory Coast",
    "Côte d'Ivoire": "Ivory Coast",
    "Tanzania": "United Republic of Tanzania",
    "Congo - Kinshasa": "Dem. Rep. Congo",
    "Congo - Brazzaville": "Republic of the Congo",
    "Bosnia & Herzegovina": "Bosnia and Herz.",
    "North Macedonia": "Macedonia",
    "Eswatini": "Swaziland",
    "Bahamas": "The Bahamas",
    "Cabo Verde": "Cape Verde",
    "Timor-Leste": "East Timor",
    "Hong Kong": "Hong Kong S.A.R.",
    "Macao": "Macao S.A.R",
  };
  function normalizeName(name) {
    return (name && NAME_ALIASES[name]) || name;
  }

  // Natural Earth shape name → ISO 3166-1 alpha-2, used only to find and
  // outline the reader's own country. Names here are the world-atlas
  // `properties.name` values (so "Turkey", "United States of America"…).
  const NAME_TO_ISO2 = {
    "United States of America": "US", "Canada": "CA", "Mexico": "MX",
    "Guatemala": "GT", "El Salvador": "SV", "Honduras": "HN", "Nicaragua": "NI",
    "Costa Rica": "CR", "Panama": "PA", "Cuba": "CU", "Dominican Republic": "DO",
    "Brazil": "BR", "Argentina": "AR", "Chile": "CL", "Colombia": "CO",
    "Peru": "PE", "Venezuela": "VE", "Ecuador": "EC", "Bolivia": "BO",
    "Uruguay": "UY", "Paraguay": "PY",
    "United Kingdom": "GB", "Ireland": "IE", "France": "FR", "Spain": "ES",
    "Portugal": "PT", "Italy": "IT", "Germany": "DE", "Netherlands": "NL",
    "Belgium": "BE", "Switzerland": "CH", "Austria": "AT", "Sweden": "SE",
    "Norway": "NO", "Denmark": "DK", "Finland": "FI", "Poland": "PL",
    "Czech Republic": "CZ", "Greece": "GR", "Romania": "RO", "Hungary": "HU",
    "Bulgaria": "BG", "Serbia": "RS", "Croatia": "HR", "Slovenia": "SI",
    "Slovakia": "SK", "Estonia": "EE", "Latvia": "LV", "Lithuania": "LT",
    "Belarus": "BY", "Ukraine": "UA", "Russia": "RU", "Turkey": "TR",
    "Albania": "AL", "Iceland": "IS", "Luxembourg": "LU",
    "Israel": "IL", "Saudi Arabia": "SA", "United Arab Emirates": "AE",
    "Qatar": "QA", "Kuwait": "KW", "Bahrain": "BH", "Oman": "OM", "Iran": "IR",
    "Iraq": "IQ", "Jordan": "JO", "Lebanon": "LB",
    "Egypt": "EG", "Morocco": "MA", "Tunisia": "TN", "South Africa": "ZA",
    "Nigeria": "NG", "Kenya": "KE", "Uganda": "UG", "Ghana": "GH",
    "Ethiopia": "ET", "United Republic of Tanzania": "TZ", "Zambia": "ZM",
    "Japan": "JP", "South Korea": "KR", "China": "CN", "Taiwan": "TW",
    "Singapore": "SG", "Malaysia": "MY", "Thailand": "TH", "Vietnam": "VN",
    "Indonesia": "ID", "Philippines": "PH", "Pakistan": "PK", "Bangladesh": "BD",
    "Sri Lanka": "LK", "Nepal": "NP", "India": "IN",
    "Australia": "AU", "New Zealand": "NZ",
  };

  // IANA timezone → ISO 3166-1 alpha-2. Timezone beats navigator.language
  // because people set their clock correctly even on an English OS. Most-
  // common ~80 zones; anything missing simply skips the "you" outline.
  const TZ_TO_ISO2 = {
    "America/Bogota": "CO", "America/Lima": "PE", "America/Caracas": "VE",
    "America/La_Paz": "BO", "America/Asuncion": "PY", "America/Montevideo": "UY",
    "America/Santiago": "CL", "America/Argentina/Buenos_Aires": "AR",
    "America/Buenos_Aires": "AR", "America/Sao_Paulo": "BR", "America/Recife": "BR",
    "America/Bahia": "BR", "America/Manaus": "BR", "America/Fortaleza": "BR",
    "America/Belem": "BR", "America/Mexico_City": "MX", "America/Tijuana": "MX",
    "America/Monterrey": "MX", "America/Cancun": "MX", "America/Guatemala": "GT",
    "America/Tegucigalpa": "HN", "America/El_Salvador": "SV", "America/Managua": "NI",
    "America/Costa_Rica": "CR", "America/Panama": "PA", "America/Havana": "CU",
    "America/Santo_Domingo": "DO", "America/Puerto_Rico": "PR",
    "America/New_York": "US", "America/Detroit": "US",
    "America/Indiana/Indianapolis": "US", "America/Chicago": "US",
    "America/Denver": "US", "America/Phoenix": "US", "America/Los_Angeles": "US",
    "America/Anchorage": "US", "America/Honolulu": "US", "America/Toronto": "CA",
    "America/Vancouver": "CA", "America/Montreal": "CA", "America/Halifax": "CA",
    "America/Winnipeg": "CA", "America/Edmonton": "CA",
    "Europe/London": "GB", "Europe/Madrid": "ES", "Europe/Lisbon": "PT",
    "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Vienna": "AT",
    "Europe/Zurich": "CH", "Europe/Brussels": "BE", "Europe/Amsterdam": "NL",
    "Europe/Stockholm": "SE", "Europe/Copenhagen": "DK", "Europe/Oslo": "NO",
    "Europe/Helsinki": "FI", "Europe/Dublin": "IE", "Europe/Rome": "IT",
    "Europe/Athens": "GR", "Europe/Warsaw": "PL", "Europe/Prague": "CZ",
    "Europe/Budapest": "HU", "Europe/Bucharest": "RO", "Europe/Sofia": "BG",
    "Europe/Belgrade": "RS", "Europe/Zagreb": "HR", "Europe/Ljubljana": "SI",
    "Europe/Bratislava": "SK", "Europe/Tallinn": "EE", "Europe/Riga": "LV",
    "Europe/Vilnius": "LT", "Europe/Minsk": "BY", "Europe/Moscow": "RU",
    "Europe/Kiev": "UA", "Europe/Istanbul": "TR", "Europe/Tirane": "AL",
    "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Shanghai": "CN",
    "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW", "Asia/Singapore": "SG",
    "Asia/Kuala_Lumpur": "MY", "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN",
    "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Karachi": "PK",
    "Asia/Dhaka": "BD", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP",
    "Asia/Calcutta": "IN", "Asia/Kolkata": "IN", "Asia/Tehran": "IR",
    "Asia/Baghdad": "IQ", "Asia/Amman": "JO", "Asia/Beirut": "LB",
    "Asia/Riyadh": "SA", "Asia/Dubai": "AE", "Asia/Qatar": "QA",
    "Asia/Kuwait": "KW", "Asia/Bahrain": "BH", "Asia/Muscat": "OM",
    "Asia/Jerusalem": "IL", "Asia/Tel_Aviv": "IL",
    "Africa/Cairo": "EG", "Africa/Lagos": "NG", "Africa/Nairobi": "KE",
    "Africa/Johannesburg": "ZA", "Africa/Casablanca": "MA", "Africa/Tunis": "TN",
    "Africa/Addis_Ababa": "ET", "Africa/Lusaka": "ZM", "Africa/Accra": "GH",
    "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU",
    "Australia/Perth": "AU", "Pacific/Auckland": "NZ",
  };

  // Best-effort: timezone first, navigator.language as a last resort, null
  // if we can't tell. null → no "you" outline (never a wrong guess).
  function guessVisitorIso2() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && TZ_TO_ISO2[tz]) return TZ_TO_ISO2[tz];
    } catch (_) {}
    try {
      const langs = navigator.languages || [navigator.language || ""];
      for (const tag of langs) {
        const parts = String(tag).split("-");
        if (parts.length >= 2 && parts[1].length === 2) return parts[1].toUpperCase();
      }
    } catch (_) {}
    return null;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("load failed: " + src)); };
      document.head.appendChild(s);
    });
  }

  async function ensureD3() {
    if (!window.d3) await loadScript(D3_URL);
    if (!window.topojson) await loadScript(TOPOJSON_CLIENT_URL);
  }

  // Lazily bring up the Firebase compat SDK + project config (served by
  // Firebase Hosting at reserved /__/ URLs). Resolves true if Firestore is
  // usable, false otherwise (e.g. opened off-Hosting locally).
  async function ensureFirestore() {
    try {
      if (window.firebase && firebase.firestore) return true;
      if (!window.firebase || !firebase.firestore) {
        await loadScript("/__/firebase/" + FIREBASE_V + "/firebase-app-compat.js");
        await loadScript("/__/firebase/" + FIREBASE_V + "/firebase-firestore-compat.js");
        await loadScript("/__/firebase/init.js");
      }
      return !!(window.firebase && firebase.firestore);
    } catch (_) {
      return false;
    }
  }

  // Returns { stats, isSample }. Live Firestore when available; the baked
  // SAMPLE for local preview or when ?mock=1 is set.
  async function loadStats() {
    if (forceMock) return { stats: SAMPLE, isSample: true };
    const ok = await ensureFirestore();
    if (ok) {
      try {
        const snap = await firebase.firestore().doc(VISITOR_DOC_PATH).get();
        if (snap.exists) return { stats: snap.data(), isSample: false };
      } catch (e) {
        console.warn("[visitor-map] firestore read failed:", e);
      }
      // On Hosting but the doc isn't there yet — show nothing rather than
      // faking it. (Populated by the nightly job / manual refresh.)
      return { stats: null, isSample: false };
    }
    // Off Hosting → local preview with real-ish sample numbers.
    return { stats: SAMPLE, isSample: true };
  }

  // i18n helpers — vizI18n is the shared runtime (i18n.js). t() falls back to
  // the English-ish defaults if a key or the runtime is missing.
  const FALLBACK = {
    visitorReach: "{visitors} curious minds from {countries} countries have flipped through this notebook",
    visitorYou: "one of them is you ✦",
    visitorSample: "(sample numbers — live once deployed)",
  };
  function t(key) {
    try {
      const v = window.vizI18n && vizI18n.t(key);
      if (v != null) return v;
    } catch (_) {}
    return FALLBACK[key];
  }
  function fmt(n) {
    try { return Number(n).toLocaleString(window.vizI18n ? vizI18n.lang : "en"); }
    catch (_) { return String(n); }
  }

  let lastStats = null, lastIsSample = false, visitorIso2 = null;

  function renderCaption() {
    const cap = document.getElementById("visitor-caption");
    if (!cap || !lastStats) return;
    const text = t("visitorReach")
      .replace("{visitors}", fmt(lastStats.totalVisitors))
      .replace("{countries}", fmt(lastStats.totalCountries));
    let html = escapeHtml(text);
    // "you" note only if we matched the reader's country to one in the data.
    if (visitorIso2 && visitorInData()) {
      html += ' <span class="visitor-you">· ' + escapeHtml(t("visitorYou")) + "</span>";
    }
    if (lastIsSample) {
      html += ' <span class="visitor-sample">' + escapeHtml(t("visitorSample")) + "</span>";
    }
    cap.innerHTML = html;
  }

  function visitorInData() {
    if (!visitorIso2 || !lastStats || !lastStats.countries) return false;
    return Object.keys(lastStats.countries).some(function (name) {
      return NAME_TO_ISO2[normalizeName(name)] === visitorIso2;
    });
  }

  async function init() {
    const container = document.getElementById("visitor-map");
    if (!container) return;

    visitorIso2 = guessVisitorIso2();

    let world, result;
    try {
      await ensureD3();
      const loaded = await Promise.all([
        fetch(TOPOJSON_URL).then(function (r) { return r.json(); }),
        loadStats(),
      ]);
      world = loaded[0];
      result = loaded[1];
    } catch (err) {
      console.warn("[visitor-map] failed to load:", err);
      return;
    }

    if (!result || !result.stats) {
      // No data yet (e.g. on Hosting before the nightly job first runs):
      // hide the whole panel rather than sit on "counting visitors…".
      const panel = container.closest(".visitor-panel");
      if (panel) panel.style.display = "none";
      return;
    }
    lastStats = result.stats;
    lastIsSample = result.isSample;

    const d3 = window.d3;
    const topojson = window.topojson;
    const land = topojson.feature(world, world.objects.countries);

    // Map GA4 country names → counts keyed by the Natural Earth shape name.
    const byCountry = {};
    Object.keys(lastStats.countries || {}).forEach(function (raw) {
      const n = normalizeName(raw);
      const c = Number(lastStats.countries[raw]) || 0;
      if (c > 0) byCountry[n] = (byCountry[n] || 0) + c;
    });

    const width = Math.min(container.clientWidth || 900, 1000);
    const height = Math.round(width * 0.5);
    container.innerHTML = "";

    const svg = d3.select(container).append("svg")
      .attr("viewBox", "0 0 " + width + " " + height)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("class", "visitor-map-svg")
      .attr("role", "img")
      .attr("aria-label", "World map of where this notebook's visitors come from");

    const projection = d3.geoEqualEarth().fitSize([width, height], land);
    const path = d3.geoPath(projection);

    // Log-scaled ink density: pale paper-blue → ballpoint blue, so one giant
    // country doesn't wash everyone else out. Matches the notebook palette.
    const counts = Object.values(byCountry);
    const maxV = counts.length ? Math.max.apply(null, counts) : 1;
    const heat = d3.scaleSequential()
      .domain([0, Math.log(maxV + 1)])
      .interpolator(d3.interpolateRgb("#e3e9fb", "#2b50c8"));

    const NO_DATA = "#fffdf7";  // the light "paper" used elsewhere on the page
    const PENCIL = "#8a857c";

    svg.append("g").selectAll("path")
      .data(land.features)
      .join("path")
      .attr("d", path)
      .attr("class", function (d) {
        const iso2 = NAME_TO_ISO2[d.properties.name];
        return "country-shape" + (visitorIso2 && iso2 === visitorIso2 ? " is-you" : "");
      })
      .attr("fill", function (d) {
        const c = byCountry[d.properties.name];
        return c ? heat(Math.log(c + 1)) : NO_DATA;
      })
      .attr("stroke", PENCIL)
      .attr("stroke-width", 0.5)
      .attr("stroke-linejoin", "round")
      .append("title")
      .text(function (d) {
        const c = byCountry[d.properties.name];
        return d.properties.name + (c ? " — " + c : "");
      });

    renderCaption();
    // Re-translate the caption when the language switcher changes.
    try { window.vizI18n && vizI18n.onChange(renderCaption); } catch (_) {}

    console.log(
      "[visitor-map] " + lastStats.totalVisitors + " visitors, " +
      lastStats.totalCountries + " countries" + (lastIsSample ? " (sample)" : "")
    );
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
