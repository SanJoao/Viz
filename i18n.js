/* viz · tiny i18n runtime (shared across every entry)
 *
 * No build step, no dependency. A page calls vizI18n.init({ dict, onApply }):
 *   - dict   = { en:{...}, es:{...}, pt:{...}, fr:{...}, de:{...} }
 *   - onApply(lang, strings) runs after each (re)translation so the page can
 *     redraw anything generated in JS (cards, charts, tables…).
 *
 * Language is picked once, in this order:
 *   1. a previous manual choice saved in localStorage (always wins), else
 *   2. the visitor's own browser language (navigator.languages), else
 *   3. English.
 * A small EN/ES/PT/FR/DE switcher is mounted top-right; the choice persists.
 *
 * Static text is translated by tagging elements:
 *   data-i18n="key"                 -> sets textContent
 *   data-i18n-html="key"            -> sets innerHTML (for copy with <b>/<span>)
 *   data-i18n-attr="placeholder:key;title:key2"  -> sets attributes
 */
(function () {
  const SUPPORTED = ["en", "es", "pt", "fr", "de"];
  const SHORT = { en: "EN", es: "ES", pt: "PT", fr: "FR", de: "DE" };
  const FULL  = { en: "English", es: "Español", pt: "Português", fr: "Français", de: "Deutsch" };
  const STORE_KEY = "viz_lang";

  function detect() {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (e) { /* private mode / storage blocked */ }
    const prefs = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || "en"];
    for (const p of prefs) {
      const base = String(p || "").toLowerCase().split("-")[0];
      if (SUPPORTED.includes(base)) return base;
    }
    return "en";
  }

  let current = detect();
  let dict = null, onApply = null, switcher = null;
  const listeners = [];

  function strings() { return (dict && (dict[current] || dict.en)) || {}; }

  function apply() {
    const s = strings();
    document.documentElement.lang = current;

    document.querySelectorAll("[data-i18n]").forEach(el => {
      const v = s[el.getAttribute("data-i18n")];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-html]").forEach(el => {
      const v = s[el.getAttribute("data-i18n-html")];
      if (v != null) el.innerHTML = v;
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(el => {
      el.getAttribute("data-i18n-attr").split(";").forEach(pair => {
        const bits = pair.split(":");
        const attr = (bits[0] || "").trim(), key = (bits[1] || "").trim();
        if (attr && key && s[key] != null) el.setAttribute(attr, s[key]);
      });
    });
  }

  function paintSwitcher() {
    if (!switcher) return;
    switcher.querySelectorAll(".viz-lang-opt").forEach(b => {
      b.classList.toggle("is-on", b.dataset.lang === current);
      b.setAttribute("aria-pressed", b.dataset.lang === current);
    });
  }

  function setLang(code) {
    if (!SUPPORTED.includes(code) || code === current) return;
    current = code;
    try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
    apply();
    paintSwitcher();
    if (onApply) onApply(current, strings());
    listeners.forEach(fn => { try { fn(current); } catch (e) {} });
  }

  function buildSwitcher() {
    const wrap = document.createElement("div");
    wrap.className = "viz-lang";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Language");
    SUPPORTED.forEach(code => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "viz-lang-opt";
      b.dataset.lang = code;
      b.lang = code;
      b.textContent = SHORT[code];
      b.title = FULL[code];
      b.setAttribute("aria-label", FULL[code]);
      b.addEventListener("click", () => setLang(code));
      wrap.appendChild(b);
    });
    return wrap;
  }

  function init(opts) {
    dict = opts.dict;
    onApply = opts.onApply || null;
    apply();
    switcher = buildSwitcher();
    const mount = opts.mount ? document.querySelector(opts.mount) : document.body;
    (mount || document.body).appendChild(switcher);
    paintSwitcher();
    if (onApply) onApply(current, strings());
    return current;
  }

  window.vizI18n = {
    init,
    get lang() { return current; },
    t(key) { return strings()[key]; },
    set: setLang,
    onChange(fn) { if (typeof fn === "function") listeners.push(fn); }
  };
})();
