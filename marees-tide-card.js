{ // bloc isolé : aucune variable ne fuit vers les autres cartes
/*
 * Marées France — Tide Card (FR)
 * Carte Home Assistant pour l'intégration « Marées France » (SHOM) : prochaine marée, courbe de la hauteur d'eau
 * avec curseur, marées du jour, température de l'eau, zone de faible profondeur et calendrier des coefficients.
 * Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.
 */
const CARD_VERSION = "1.1.0";

/* === NUANCE COMMUNE v2 (cartes Johan854) ===
 * Bloc identique dans toutes les cartes. Options : nuance, nuance_perso, intensite.
 * nuance "theme" (par défaut) : suit la variable carte-nuance du thème Home Assistant ;
 * si elle n'existe pas, la carte garde ses couleurs d'origine. Intensité : 0 = neutre, 1 = normal, 2 = très coloré. */
const GV_NUANCES = [["braise", "Braise (rouge)", "#e0524f"], ["ocean", "Océan (bleu)", "#2f8fd8"], ["lagon", "Lagon (turquoise)", "#1fb5a8"], ["foret", "Forêt (vert)", "#3fae5a"], ["lavande", "Lavande (violet)", "#8a63d8"], ["framboise", "Framboise (rose)", "#e05597"], ["ambre", "Ambre (orange)", "#e8902c"], ["ardoise", "Ardoise (neutre)", "#7d8595"]];
const GV_DEFAULTS = { nuance: "theme", intensite: 1 };
const gvAccent = (c) => {
  const p = c && c.nuance_perso;
  if (c && c.nuance === "perso") {
    if (Array.isArray(p) && p.length === 3) return "#" + p.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, "0")).join("");
    if (typeof p === "string" && /^#?[0-9a-f]{6}$/i.test(p.trim())) return "#" + p.trim().replace("#", "");
  }
  const n = GV_NUANCES.find((x) => x[0] === (c && c.nuance));
  return n ? n[2] : "var(--carte-nuance)";
};
/* Variables posées sur <ha-card> : --g-bg-x (fond dégradé teinté) et --acc-ui-x (couleur d'accent).
 * Sans nuance (thème sans carte-nuance), elles sont invalides : chaque carte retombe alors sur ses couleurs d'origine. */
const gvStyle = (c, dark) => {
  const i = Number(c && c.intensite), ai = Number.isFinite(i) ? Math.max(0, Math.min(2, i)) : 1;
  const m = (pct, base) => `color-mix(in srgb,var(--acc-ui) ${+(pct * ai).toFixed(1)}%,${base})`;
  const bg = dark ? `linear-gradient(160deg,${m(5, "#1b1e32")} 0%,${m(11, "#1f1b2c")} 55%,${m(22, "#1c1620")} 100%)`
    : `linear-gradient(160deg,${m(2, "#f8f9fd")} 0%,${m(5, "#eef1f8")} 55%,${m(11, "#f8f8fa")} 100%)`;
  return `--acc-ui:${gvAccent(c)};--g-bg-x:${bg};--acc-ui-x:color-mix(in srgb,var(--acc-ui) ${dark ? "80%,#fff" : "82%,#000"})`;
};
const GV_FIELDS = [
  { name: "nuance", selector: { select: { mode: "dropdown", options: [{ value: "theme", label: "Selon le thème (couleurs d'origine)" }, ...GV_NUANCES.map((n) => ({ value: n[0], label: n[1] })), { value: "perso", label: "Personnalisée" }] } } },
  { name: "nuance_perso", selector: { color_rgb: {} } },
  { name: "intensite", selector: { number: { min: 0, max: 2, step: 0.1, mode: "slider" } } }];
const GV_LABELS = { nuance: "Nuance de couleur", nuance_perso: "Couleur personnalisée (nuance « Personnalisée »)", intensite: "Intensité de la nuance" };
/* === FIN NUANCE COMMUNE === */

const DEFAULTS = {
  device_id: "",
  title: "",
  theme: "auto", nuance: "theme", intensite: 1, // auto | light | dark
  card_type: "full", // full | condensed
  days: 7,
  show_temperature: true,
  show_min_depth: true,
  show_coefficients: true,
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
const keyMs = (date, time) => { const [y, mo, d] = date.split("-").map(Number); const [h, mi] = time.split(":").map(Number); return Date.UTC(y, mo - 1, d, h, mi) / 60000; };
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
const coefColor = (c) => (c >= 95 ? "var(--mt-err)" : c >= 70 ? "var(--mt-warn)" : c >= 45 ? "var(--mt-ok)" : "var(--mt-acc)");
const coefLabel = (c) => (c >= 95 ? "Très forte" : c >= 70 ? "Forte" : c >= 45 ? "Moyenne" : "Faible");

class MareesTideCard extends HTMLElement {
  static getConfigElement() { return document.createElement("marees-tide-card-editor"); }
  static getStubConfig(hass) {
    const dev = hass && hass.devices ? Object.entries(hass.devices).find(([, d]) => /mar[ée]es|harbor|port/i.test(d.name || "")) : null;
    return { ...DEFAULTS, device_id: dev ? dev[0] : "" };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._tab = "tides";
    this._wl = {};
    this._tides = null;
    this._temp = null;
    this._depth = null;
    this._coefs = null;
    this._calOff = 0;
    this._graphOpen = false;
    this._cursor = null;
    this._sig = "";
  }

  setConfig(config) {
    if (!config || !config.device_id) throw new Error("Choisis l'appareil « Marées France » (device_id).");
    this._config = { ...DEFAULTS, ...config };
    this._loaded = false; this._wl = {}; this._tides = null; this._sig = "";
    this._selected = null;
    if (this._hass) this._init();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    if (first || !this._loaded) this._init();
    const sig = this._now().date + this._now().min + (this._isDark() ? "d" : "l");
    if (sig !== this._sig) { this._sig = sig; this._render(); }
  }

  getCardSize() { return 7; }

  _isDark() {
    const t = this._config && this._config.theme;
    if (t === "dark") return true;
    if (t === "light") return false;
    const dm = this._hass && this._hass.themes && this._hass.themes.darkMode;
    return typeof dm === "boolean" ? dm : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  _tz() { return (this._hass && this._hass.config && this._hass.config.time_zone) || "Europe/Paris"; }
  _lang() { return (this._hass && this._hass.locale && this._hass.locale.language) || "fr"; }
  _nf(n, d = 1) { return new Intl.NumberFormat(this._lang(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n); }

  _now() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: this._tz(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t).value;
    return { date: `${g("year")}-${g("month")}-${g("day")}`, min: Number(g("hour")) * 60 + Number(g("minute")) };
  }

  _more(id) { if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } })); }

  async _ws(type, extra = {}) { return this._hass.callWS({ type: "marees_france/" + type, device_id: this._config.device_id, ...extra }); }

  async _init() {
    if (this._loaded || !this._hass || !this._config) return;
    this._loaded = true;
    const today = this._now().date;
    this._selected = this._selected || today;
    this._day = today;
    this._busy = true; this._render();
    const jobs = [
      this._ws("get_tides_data").then((r) => { this._tides = r && !r.error ? r : { error: (r && (r.message || r.error)) || "Données indisponibles" }; }).catch((e) => { this._tides = { error: e.message || String(e) }; }),
      this._loadWater(this._selected),
    ];
    if (this._config.show_temperature) jobs.push(this._ws("get_water_temp").then((r) => { this._temp = r; }).catch(() => {}));
    if (this._config.show_min_depth) jobs.push(this._ws("get_harbor_min_depth").then((r) => { this._depth = r; }).catch(() => {}));
    await Promise.all(jobs);
    this._busy = false; this._render();
    clearInterval(this._timer);
    this._timer = setInterval(() => { this._wl = {}; this._loaded = false; this._init(); }, 6 * 3600 * 1000);
  }

  async _loadWater(date) {
    if (this._wl[date] !== undefined) return;
    this._wl[date] = null;
    try { const r = await this._ws("get_water_levels", { date }); this._wl[date] = r && !r.error && Array.isArray(r[date]) ? r[date] : []; }
    catch (e) { this._wl[date] = []; }
  }

  async _loadCoefs() {
    if (this._coefs) return;
    const first = this._now().date.slice(0, 8) + "01";
    try { const r = await this._ws("get_coefficients_data", { date: first, days: 365 }); this._coefs = r && !r.error ? r : {}; } catch (e) { this._coefs = {}; }
    this._render();
  }

  // ----- données -----
  _events() {
    const t = this._tides;
    if (!t || t.error) return [];
    const out = [];
    for (const [date, list] of Object.entries(t)) {
      if (!Array.isArray(list)) continue;
      for (const a of list) {
        if (!Array.isArray(a) || a.length < 3) continue;
        const type = /high/.test(a[0]) ? "high" : /low/.test(a[0]) ? "low" : null;
        const h = parseFloat(a[2]);
        if (!type || !a[1] || isNaN(h)) continue;
        const c = a[3] && a[3] !== "---" ? parseInt(a[3], 10) : null;
        out.push({ type, date, time: a[1], h, coef: isNaN(c) ? null : c, ms: keyMs(date, a[1]) });
      }
    }
    return out.sort((x, y) => x.ms - y.ms);
  }

  _curve(date, evs) {
    const lv = this._wl[date];
    if (Array.isArray(lv) && lv.length > 10) {
      return lv.map((p) => [toMin(p[0]), parseFloat(p[1])]).filter((p) => !isNaN(p[1])).sort((a, b) => a[0] - b[0]);
    }
    // repli : interpolation en cosinus entre les marées
    const day0 = keyMs(date, "00:00");
    const pts = [];
    for (let m = 0; m <= 1440; m += 10) {
      const t = day0 + m;
      let a = null, b = null;
      for (let i = 0; i < evs.length; i++) { if (evs[i].ms <= t) a = evs[i]; if (evs[i].ms > t) { b = evs[i]; break; } }
      if (!a || !b) continue;
      const f = (t - a.ms) / (b.ms - a.ms);
      pts.push([m, (a.h + b.h) / 2 + ((a.h - b.h) / 2) * Math.cos(Math.PI * f)]);
    }
    return pts;
  }

  _heightAt(pts, min) {
    if (!pts.length) return null;
    for (let i = 1; i < pts.length; i++) if (pts[i][0] >= min) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (min - x0)) / (x1 - x0); }
    return null;
  }

  _status(evs) {
    const n = this._now(), nk = keyMs(n.date, `${pad(Math.floor(n.min / 60))}:${pad(n.min % 60)}`);
    const next = evs.find((e) => e.ms > nk);
    if (!next) return null;
    const prev = [...evs].reverse().find((e) => e.ms <= nk);
    const rising = prev ? prev.type === "low" : next.type === "high";
    const high = rising ? evs.find((e) => e.ms > nk && e.type === "high") : (prev && prev.type === "high" ? prev : [...evs].reverse().find((e) => e.ms <= nk && e.type === "high"));
    return { next, rising, coef: high ? high.coef : null, left: next.ms - nk };
  }

  _dur(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${pad(m)}` : `${m} min`; }

  // ----- rendu -----
  _graph(date, evs) {
    const c = this._config, W = 360, H = 190, L = 34, R = 10, T = 26, B = 24, PW = W - L - R, PH = H - T - B;
    const pts = this._curve(date, evs);
    const dayEvs = evs.filter((e) => e.date === date);
    if (!pts.length && !dayEvs.length) return `<div class="empty">Aucune donnée pour ce jour.</div>`;
    const hs = pts.map((p) => p[1]).concat(dayEvs.map((e) => e.h));
    const md = c.show_min_depth && this._depth && Number(this._depth.harborMinDepth) > 0 ? Number(this._depth.harborMinDepth) : null;
    let lo = Math.min(...hs, md ?? Infinity), hi = Math.max(...hs);
    lo = Math.floor((lo - 1.2) * 2) / 2; hi = Math.ceil((hi + 0.7) * 2) / 2;
    const X = (m) => L + (m / 1440) * PW, Y = (h) => T + PH - ((h - lo) / (hi - lo)) * PH;
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
    const area = pts.length ? `${line} L${X(pts[pts.length - 1][0]).toFixed(1)} ${T + PH} L${X(pts[0][0]).toFixed(1)} ${T + PH} Z` : "";
    const n = this._now(), isToday = n.date === date;
    const nowH = isToday ? this._heightAt(pts, n.min) : null;
    const grid = [];
    for (let h = Math.ceil(lo); h <= hi; h += (hi - lo > 7 ? 2 : 1)) grid.push(`<line x1="${L}" x2="${W - R}" y1="${Y(h).toFixed(1)}" y2="${Y(h).toFixed(1)}" class="gl"/><text x="${L - 5}" y="${(Y(h) + 3).toFixed(1)}" class="ax" text-anchor="end">${h}</text>`);
    const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<text x="${X(h * 60).toFixed(1)}" y="${H - 7}" class="ax" text-anchor="middle">${pad(h % 24)}h</text>`).join("");
    const zone = md !== null && md > lo ? `<rect x="${L}" y="${Y(md).toFixed(1)}" width="${PW}" height="${(T + PH - Y(md)).toFixed(1)}" class="danger"/><text x="${L + 4}" y="${(Y(md) + 10).toFixed(1)}" class="dz">Faible profondeur &lt; ${this._nf(md)} m</text>` : "";
    const marks = dayEvs.map((e) => {
      const x = Math.min(W - 24, Math.max(L + 18, X(toMin(e.time)))), y = Y(e.h), hi_ = e.type === "high";
      return `<circle cx="${X(toMin(e.time)).toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" class="pt ${e.type}"/>
        <text x="${x.toFixed(1)}" y="${(y + (hi_ ? -9 : 15)).toFixed(1)}" class="mk" text-anchor="middle">${e.time}</text>
        <text x="${x.toFixed(1)}" y="${(y + (hi_ ? -18 : 24)).toFixed(1)}" class="mh" text-anchor="middle">${this._nf(e.h)} m</text>`;
    }).join("");
    const nowMark = isToday && nowH !== null ? `<line x1="${X(n.min).toFixed(1)}" x2="${X(n.min).toFixed(1)}" y1="${T}" y2="${T + PH}" class="nl"/><circle cx="${X(n.min).toFixed(1)}" cy="${Y(nowH).toFixed(1)}" r="5" class="nowdot"/>` : "";
    return `<div class="gwrap"><svg class="gsvg" viewBox="0 0 ${W} ${H}" data-l="${L}" data-pw="${PW}" data-w="${W}" data-t="${T}" data-ph="${PH}" data-lo="${lo}" data-hi="${hi}" aria-label="Hauteur d'eau">
      <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--mt-acc)" stop-opacity=".55"/><stop offset="1" stop-color="var(--mt-acc)" stop-opacity=".05"/></linearGradient></defs>
      ${grid.join("")}${zone}<path d="${area}" fill="url(#wg)"/><path d="${line}" class="curve" fill="none"/>${nowMark}${marks}${hours}
      <g class="cur" style="display:none"><line y1="${T}" y2="${T + PH}" class="cl"/><circle r="4" class="cd"/></g>
      <rect class="hit" x="${L}" y="${T}" width="${PW}" height="${PH}" fill="transparent"/></svg><div class="tip" hidden></div></div>`;
  }

  _render() {
    const c = this._config, h = this._hass;
    if (!c || !h) return;
    const dark = this._isDark(), evs = this._events(), st = this._status(evs), n = this._now();
    const sel = this._selected || n.date;
    const lang = this._lang();
    const title = c.title || (h.devices && h.devices[c.device_id] && h.devices[c.device_id].name) || "Marées";
    const err = this._tides && this._tides.error;
    const temp = (() => { const d = this._temp && this._temp[n.date]; return d && d[0] && !isNaN(Number(d[0].temp)) ? Number(d[0].temp) : null; })();

    const status = st ? `<div class="stat glass"><div class="sl"><ha-icon icon="${st.rising ? "mdi:wave-arrow-up" : "mdi:wave-arrow-down"}" class="${st.rising ? "up" : "down"}"></ha-icon>
        <div><div class="s1">${st.rising ? "Marée montante" : "Marée descendante"}</div><div class="s2">${st.next.type === "high" ? "Pleine mer" : "Basse mer"} à <b>${st.next.time}</b> · dans ${this._dur(st.left)}</div></div></div>
        <div class="sr"><span>${this._nf(st.next.h)} m</span>${st.coef !== null ? `<span class="coef" style="--c:${coefColor(st.coef)}">Coef. ${st.coef}</span>` : ""}${temp !== null && c.show_temperature ? `<span class="tmp"><ha-icon icon="mdi:thermometer-water"></ha-icon>${this._nf(temp)} °C</span>` : ""}</div></div>`
      : `<div class="stat glass"><div class="s2">${err ? esc(err) : this._busy ? "Chargement…" : "En attente de la prochaine marée"}</div></div>`;

    const days = Array.from({ length: Math.max(3, Math.min(10, Number(c.days) || 7)) }, (_, i) => addDays(n.date, i));
    const tabs = days.map((d, i) => {
      const dt = new Date(d + "T12:00:00");
      return `<button class="dt ${d === sel ? "on" : ""}" data-day="${d}"><span>${i === 0 ? "AUJ." : new Intl.DateTimeFormat(lang, { weekday: "short" }).format(dt).replace(".", "").toUpperCase()}</span><b>${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}</b></button>`;
    }).join("");

    const dayEvs = evs.filter((e) => e.date === sel);
    const list = dayEvs.length ? `<div class="list glass">${dayEvs.map((e) => `<div class="row ${e.ms < keyMs(n.date, `${pad(Math.floor(n.min / 60))}:${pad(n.min % 60)}`) ? "past" : ""}">
        <ha-icon icon="${e.type === "high" ? "mdi:arrow-up-bold-circle" : "mdi:arrow-down-bold-circle"}" class="${e.type === "high" ? "up" : "down"}"></ha-icon>
        <span class="rt">${e.type === "high" ? "Pleine mer" : "Basse mer"}</span><b>${e.time}</b><span class="rh">${this._nf(e.h)} m</span>
        ${e.coef !== null ? `<span class="coef sm" style="--c:${coefColor(e.coef)}">${e.coef}</span>` : `<span></span>`}</div>`).join("")}</div>` : `<div class="empty">Aucune marée pour ce jour.</div>`;

    const showGraph = c.card_type !== "condensed" || this._graphOpen;
    const tides = `${showGraph ? this._graph(sel, evs) : ""}<div class="tabsd">${tabs}</div>${list}`;
    const coefsView = this._coefsView(n, lang);

    const tabsTop = c.show_coefficients ? `<div class="tabs"><button class="tab ${this._tab === "tides" ? "on" : ""}" data-tab="tides"><ha-icon icon="mdi:waves"></ha-icon>Marées</button>
      <button class="tab ${this._tab === "coefs" ? "on" : ""}" data-tab="coefs"><ha-icon icon="mdi:calendar-month"></ha-icon>Coefficients</button></div>` : "";

    this.shadowRoot.innerHTML = `<style>${this._css()}</style>
    <ha-card class="${dark ? "dark" : "light"}" style="${gvStyle(this._config, dark)}">
      <div class="hd"><span class="t">${esc(title)}</span>${c.card_type === "condensed" ? `<button class="ic ${this._graphOpen ? "on" : ""}" data-graph="1" title="Afficher/cacher le graphique"><ha-icon icon="mdi:sine-wave"></ha-icon></button>` : ""}</div>
      ${status}${tabsTop}${this._tab === "coefs" && c.show_coefficients ? coefsView : tides}
    </ha-card>`;
    this._bind();
  }

  _coefsView(n, lang) {
    if (!this._coefs) { this._loadCoefs(); return `<div class="empty">Chargement des coefficients…</div>`; }
    const [y, m] = n.date.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1 + this._calOff, 1));
    const yy = first.getUTCFullYear(), mm = first.getUTCMonth();
    const dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate(), start = (first.getUTCDay() + 6) % 7;
    const title = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
    let cells = "";
    for (let i = 0; i < start; i++) cells += "<span></span>";
    for (let d = 1; d <= dim; d++) {
      const key = `${yy}-${pad(mm + 1)}-${pad(d)}`, arr = (this._coefs[key] || []).map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));
      const mx = arr.length ? Math.max(...arr) : null;
      cells += `<button class="cd ${key === n.date ? "today" : ""} ${key === this._selected ? "sel" : ""}" data-day="${key}" ${mx === null ? "disabled" : ""}><i>${d}</i>${mx !== null ? `<b style="--c:${coefColor(mx)}">${mx}</b>` : `<b class="na">–</b>`}</button>`;
    }
    return `<div class="cal glass"><div class="ch"><button data-cal="-1" ${this._calOff <= 0 ? "disabled" : ""}>‹</button><b>${esc(title)}</b><button data-cal="1" ${this._calOff >= 11 ? "disabled" : ""}>›</button></div>
      <div class="cg">${["L", "M", "M", "J", "V", "S", "D"].map((x) => `<span class="wd">${x}</span>`).join("")}${cells}</div>
      <div class="lg">${[[30, "Faible"], [60, "Moyenne"], [80, "Forte"], [100, "Très forte"]].map(([v, l]) => `<span><i style="background:${coefColor(v)}"></i>${l}</span>`).join("")}</div></div>`;
  }

  _bind() {
    const R = this.shadowRoot;
    R.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { this._tab = b.dataset.tab; this._render(); }));
    R.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", async () => {
      this._selected = b.dataset.day; this._tab = "tides"; this._render();
      await this._loadWater(this._selected); this._render();
    }));
    R.querySelectorAll("[data-cal]").forEach((b) => b.addEventListener("click", () => { this._calOff += Number(b.dataset.cal); this._render(); }));
    const g = R.querySelector("[data-graph]");
    if (g) g.addEventListener("click", () => { this._graphOpen = !this._graphOpen; this._render(); });
    const svg = R.querySelector(".gsvg");
    if (svg) this._bindCursor(svg);
  }

  _bindCursor(svg) {
    const hit = svg.querySelector(".hit"), cur = svg.querySelector(".cur"), tip = this.shadowRoot.querySelector(".tip");
    const L = Number(svg.dataset.l), PW = Number(svg.dataset.pw), W = Number(svg.dataset.w), T = Number(svg.dataset.t), PH = Number(svg.dataset.ph), lo = Number(svg.dataset.lo), hi = Number(svg.dataset.hi);
    const pts = this._curve(this._selected || this._now().date, this._events());
    const move = (ev) => {
      const r = svg.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * W;
      const min = Math.max(0, Math.min(1440, ((x - L) / PW) * 1440)), hh = this._heightAt(pts, min);
      if (hh === null) return;
      const cx = L + (min / 1440) * PW, cy = T + PH - ((hh - lo) / (hi - lo)) * PH;
      cur.style.display = ""; cur.querySelector("line").setAttribute("x1", cx); cur.querySelector("line").setAttribute("x2", cx);
      const dot = cur.querySelector("circle"); dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
      tip.hidden = false; tip.textContent = `${pad(Math.floor(min / 60))}:${pad(Math.floor(min % 60))} · ${this._nf(hh, 2)} m`;
      tip.style.left = `${Math.min(r.width - 90, Math.max(0, (cx / W) * r.width - 40))}px`;
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { cur.style.display = "none"; tip.hidden = true; });
  }

  _css() {
    return `
    * { box-sizing:border-box; }
    ha-card.dark { --mt-text:#f4f6fb; --mt-muted:#a9afc0; --mt-bg:var(--g-bg-x,linear-gradient(160deg,#16243a 0%,#1b1e32 50%,#241a2a 100%)); --mt-border:rgba(255,255,255,.14); --mt-shadow:0 .6em 2em rgba(0,0,0,.35);
      --mt-glass:rgba(255,255,255,.07); --mt-glass-b:rgba(255,255,255,.13); --mt-acc:var(--acc-ui-x,#4fb3ff); --mt-ok:#3ddc84; --mt-warn:#ffb86b; --mt-err:#ff5a5f; --mt-grid:rgba(255,255,255,.1); }
    ha-card.light { --mt-text:#1c2030; --mt-muted:#5d6477; --mt-bg:var(--g-bg-x,linear-gradient(160deg,#eef5fc 0%,#eef1f8 55%,#f6f0f2 100%)); --mt-border:rgba(20,24,40,.12); --mt-shadow:0 .4em 1.4em rgba(20,24,40,.12);
      --mt-glass:rgba(255,255,255,.7); --mt-glass-b:rgba(20,24,40,.1); --mt-acc:var(--acc-ui-x,#1a76d2); --mt-ok:#1a9d55; --mt-warn:#c77a14; --mt-err:#d32f35; --mt-grid:rgba(20,24,40,.12); }
    ha-card { container-type:inline-size; display:flex; flex-direction:column; gap:12px; padding:16px; color:var(--mt-text); border-radius:24px; border:1px solid var(--mt-border); background:var(--mt-bg); box-shadow:var(--mt-shadow); overflow:hidden; }
    ha-icon { --mdc-icon-size:1.25em; flex:none; }
    button { font:inherit; color:inherit; background:none; border:0; padding:0; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    button:disabled { opacity:.35; cursor:default; }
    .glass { background:var(--mt-glass); border:1px solid var(--mt-glass-b); -webkit-backdrop-filter:blur(18px) saturate(140%); backdrop-filter:blur(18px) saturate(140%); }
    .hd { display:flex; justify-content:space-between; align-items:center; } .hd .t { font-weight:700; font-size:1.05em; }
    .ic { display:flex; padding:.35em; border-radius:99px; background:var(--mt-glass); border:1px solid var(--mt-glass-b); } .ic.on { color:var(--mt-acc); }
    .stat { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding:12px 14px; border-radius:20px; }
    .sl { display:flex; align-items:center; gap:.7em; } .sl ha-icon { --mdc-icon-size:2.2em; } .up { color:var(--mt-ok); } .down { color:var(--mt-acc); }
    .s1 { font-weight:700; } .s2 { font-size:.85em; color:var(--mt-muted); } .s2 b { color:var(--mt-text); }
    .sr { display:flex; align-items:center; gap:.6em; font-weight:700; flex-wrap:wrap; }
    .coef { font-size:.8em; padding:.2em .6em; border-radius:99px; color:var(--c); border:1px solid var(--c); background:color-mix(in srgb, var(--c) 14%, transparent); font-weight:700; } .coef.sm { font-size:.76em; justify-self:end; }
    .tmp { display:flex; align-items:center; gap:.2em; font-size:.85em; color:var(--mt-muted); font-weight:600; } .tmp ha-icon { --mdc-icon-size:1.1em; color:var(--mt-acc); }
    .tabs { display:flex; gap:6px; } .tab { flex:1; display:flex; justify-content:center; align-items:center; gap:.4em; padding:.5em .6em; border-radius:99px; font-size:.85em; color:var(--mt-muted); background:var(--mt-glass); border:1px solid var(--mt-glass-b); }
    .tab.on { color:var(--mt-text); border-color:var(--mt-acc); background:color-mix(in srgb, var(--mt-acc) 18%, transparent); }
    .gwrap { position:relative; border-radius:18px; background:var(--mt-glass); border:1px solid var(--mt-glass-b); padding:6px; } .gsvg { display:block; width:100%; height:auto; touch-action:pan-y; }
    .gl { stroke:var(--mt-grid); stroke-width:1; } .ax { fill:var(--mt-muted); font-size:9px; } .curve { stroke:var(--mt-acc); stroke-width:2.2; stroke-linejoin:round; }
    .danger { fill:var(--mt-err); opacity:.16; } .dz { fill:var(--mt-err); font-size:8px; }
    .pt { stroke:var(--mt-text); stroke-width:1.2; } .pt.high { fill:var(--mt-ok); } .pt.low { fill:var(--mt-acc); }
    .mk { fill:var(--mt-text); font-size:9.5px; font-weight:700; } .mh { fill:var(--mt-muted); font-size:8.5px; }
    .nl { stroke:var(--mt-warn); stroke-dasharray:3 3; stroke-width:1.3; } .nowdot { fill:var(--mt-warn); stroke:#fff; stroke-width:1.5; }
    .cl { stroke:var(--mt-text); stroke-opacity:.4; stroke-dasharray:2 3; } .cd { fill:var(--mt-text); }
    .tip { position:absolute; top:4px; padding:.2em .6em; border-radius:8px; font-size:.78em; font-weight:700; background:var(--mt-bg); border:1px solid var(--mt-glass-b); pointer-events:none; white-space:nowrap; }
    .tabsd { display:grid; grid-auto-flow:column; grid-auto-columns:1fr; gap:5px; overflow-x:auto; }
    .dt { display:flex; flex-direction:column; align-items:center; padding:.45em .2em; border-radius:12px; background:var(--mt-glass); border:1px solid var(--mt-glass-b); min-width:3.4em; } .dt span { font-size:.66em; color:var(--mt-muted); font-weight:700; } .dt b { font-size:.82em; }
    .dt.on { border-color:var(--mt-acc); background:color-mix(in srgb, var(--mt-acc) 18%, transparent); } .dt.on span { color:var(--mt-text); }
    .list { display:flex; flex-direction:column; border-radius:18px; padding:2px 12px; }
    .row { display:grid; grid-template-columns:auto 1fr auto auto auto; align-items:center; gap:.6em; padding:.6em 0; border-top:1px solid var(--mt-glass-b); font-size:.88em; } .row:first-child { border-top:0; } .row.past { opacity:.55; }
    .rt { color:var(--mt-muted); } .rh { min-width:3.6em; text-align:right; font-variant-numeric:tabular-nums; } .row b { font-variant-numeric:tabular-nums; }
    .empty { text-align:center; color:var(--mt-muted); padding:1.2em; font-size:.9em; }
    .cal { border-radius:18px; padding:10px; } .ch { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; text-transform:capitalize; } .ch button { font-size:1.5em; padding:0 .5em; }
    .cg { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; text-align:center; } .wd { font-size:.7em; color:var(--mt-muted); }
    .cd { display:flex; flex-direction:column; align-items:center; gap:2px; padding:4px 0; border-radius:10px; border:1px solid transparent; } .cd i { font-style:normal; font-size:.7em; color:var(--mt-muted); }
    .cd b { font-size:.82em; color:var(--c); } .cd b.na { color:var(--mt-muted); } .cd.today { border-color:var(--mt-warn); } .cd.sel { background:color-mix(in srgb, var(--mt-acc) 18%, transparent); }
    .lg { display:flex; flex-wrap:wrap; gap:.4em .9em; justify-content:center; margin-top:8px; font-size:.72em; color:var(--mt-muted); } .lg i { display:inline-block; width:.7em; height:.7em; border-radius:50%; margin-right:.35em; }`;
  }
}

/* ---------- Éditeur visuel ---------- */
const LABELS = { ...GV_LABELS, device_id: "Port (appareil Marées France)", title: "Titre (facultatif)", theme: "Thème", card_type: "Type de carte", days: "Jours affichés (3 à 10)",
  show_temperature: "Température de l'eau", show_min_depth: "Zone de faible profondeur", show_coefficients: "Onglet coefficients" };
const SCHEMA = [
  { name: "device_id", required: true, selector: { device: { integration: "marees_france" } } },
  { name: "title", selector: { text: {} } },
  { type: "grid", name: "", schema: [
    { name: "theme", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automatique" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }] } } }, ...GV_FIELDS,
    { name: "card_type", selector: { select: { mode: "dropdown", options: [{ value: "full", label: "Complète" }, { value: "condensed", label: "Condensée" }] } } } ] },
  { name: "days", selector: { number: { min: 3, max: 10, mode: "box" } } },
  { type: "grid", name: "", schema: [{ name: "show_temperature", selector: { boolean: {} } }, { name: "show_min_depth", selector: { boolean: {} } }, { name: "show_coefficients", selector: { boolean: {} } }] },
];
class MareesTideCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...DEFAULTS, ...config }; if (!this._form) this._build(); else this._form.data = this._config; }
  set hass(h) { this._hass = h; if (this._form) this._form.hass = h; }
  _build() {
    const f = document.createElement("ha-form");
    f.hass = this._hass; f.data = this._config; f.schema = SCHEMA; f.computeLabel = (s) => LABELS[s.name] || s.name;
    f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); this._config = { ...ev.detail.value }; this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true })); });
    this._form = f; this.appendChild(f);
  }
}

customElements.define("marees-tide-card", MareesTideCard);
customElements.define("marees-tide-card-editor", MareesTideCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "marees-tide-card", name: "Marées France — Tide Card (FR)", description: "Marées : prochaine marée, courbe de hauteur d'eau, marées du jour et calendrier des coefficients.", preview: false });
console.info(`%c MAREES-TIDE-CARD %c v${CARD_VERSION} `, "color:#fff;background:#1a76d2;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px", "color:#1a76d2;background:#fff;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px");
}
