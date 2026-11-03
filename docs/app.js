/* Legge di bilancio 2027-2029: lettura guidata. Nessuna dipendenza esterna.
   Fonti: testo del DDL (articoli, allegati 1, 5, 6, 7) e Relazione tecnica. */
(function () {
  "use strict";

  // ---------------- utilita' ----------------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf0 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
  const eur = (n) => {
    if (n == null || isNaN(n)) return "n.d.";
    const a = Math.abs(n);
    if (a >= 1e9) return nf1.format(n / 1e9) + " mld €";
    if (a >= 1e6) return nf1.format(n / 1e6) + " mln €";
    if (a >= 1e3) return nf0.format(n / 1e3) + " mila €";
    return nf0.format(n) + " €";
  };
  const eurS = (n) => eur(n).replace(" €", ""); // compatto per etichette
  const pct = (x) => (isFinite(x) ? nf1.format(x * 100) + "%" : "n.d.");
  const cap = (s) => { s = String(s || ""); s = s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s; return s.replace(/^(titolo|capo) ([ivxl]+)\b/i, (m, a, b) => a + " " + b.toUpperCase()).replace(/made in italy/gi, "made in Italy").replace(/\bue\b/g, "UE").replace(/\bcnel\b/gi, "CNEL"); };
  const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’'`]/g, " ");
  const enc = encodeURIComponent, dec = decodeURIComponent;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ICO = {
    min: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10m4 11V10m6 11V10m4 11V10M2 10l10-6 10 6"/></svg>',
    mis: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    arg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  };

  // ---------------- dati ----------------
  const D = {};
  async function load() {
    const r = await fetch("data/ddl.json");
    if (!r.ok) throw new Error("data/ddl.json");
    const d = await r.json();
    D.min = d.ministeri; D.minBy = Object.fromEntries(d.ministeri.map((m) => [m.k, m]));
    D.al = d.allegati; D.a1 = d.allegato1; D.art = d.articoli; D.artBy = Object.fromEntries(d.articoli.map((a) => [a.n, a]));
    D.tot = {}; D.minAl = {}; D.progs = new Map(); D.mis = new Map();
    for (const r of D.al) {
      if (r.liv === "totale") D.tot[r.a] = r;
      if (r.liv === "ministero") (D.minAl[r.min] || (D.minAl[r.min] = {}))["a" + r.a] = r;
      if (r.liv === "programma") {
        const key = r.min + "/" + r.cod;
        let p = D.progs.get(key);
        if (!p) { p = { key, min: r.min, cod: r.cod, prg: r.prg, mis: r.mis, cmis: r.cmis }; D.progs.set(key, p); }
        p["a" + r.a] = r;
        let m = D.mis.get(r.cmis);
        if (!m) { m = { k: r.cmis, nome: r.mis, progs: new Set() }; D.mis.set(r.cmis, m); }
        m.progs.add(key);
      }
    }
    for (const a of D.art) a._s = null; // indice di ricerca costruito su richiesta
  }

  // profilo annuo 2027-2032 di un insieme di righe programma (o ministero)
  const YEARS = ["2027", "2028", "2029", "2030", "2031", "2032"];
  function profile(list) {
    const t2 = [0, 0, 0, 0, 0, 0], t1 = [0, 0, 0, 0, 0, 0], inc = [0, 0, 0, 0, 0, 0], p2 = [0, 0, 0], p1 = [0, 0, 0];
    for (const x of list) {
      if (x.a5) x.a5.v.forEach((v, i) => { t2[i] += v; p2[i] += x.a5.p[i]; });
      if (x.a7) { x.a7.v.forEach((v, i) => { t1[i] += v; p1[i] += x.a7.p[i]; }); for (let i = 3; i < 6; i++) t1[i] += x.a7.v[2]; }
      if (x.a6) x.a6.v.forEach((v, i) => (inc[i + 3] += v));
    }
    return { t2, t1, inc, p2, p1, cut2: sum(t2), cut1: sum(t1.slice(0, 3)), incT: sum(inc), regime1: t1[2] };
  }
  const progsOf = (pred) => [...D.progs.values()].filter(pred);

  // ---------------- grafici SVG ----------------
  function chartProfile(pf, { h = 280 } = {}) {
    const W = 680, top = 26, bot = 46, left = 8, right = 8;
    const pos = Math.max(1, ...pf.inc), neg = Math.max(1, ...YEARS.map((_, i) => -(pf.t2[i] + pf.t1[i])));
    const span = h - top - bot, zero = top + span * (pos / (pos + neg));
    const sc = span / (pos + neg), bw = (W - left - right) / YEARS.length, w = Math.min(64, bw * 0.56);
    let s = `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="Profilo annuo delle variazioni">`;
    s += `<line x1="0" x2="${W}" y1="${zero}" y2="${zero}" stroke="currentColor" stroke-opacity=".2"/>`;
    YEARS.forEach((y, i) => {
      const cx = left + bw * i + bw / 2, x = cx - w / 2;
      let yy = zero;
      const parts = [
        { v: -pf.t2[i], c: "var(--cut)", tip: `Titolo II (all. 5), ${y}: <b>${eur(pf.t2[i])}</b>${i < 3 ? `<br>di cui predeterminate per legge: ${eur(pf.p2[i])}` : ""}` },
        { v: -pf.t1[i], c: "var(--t1)", o: i > 2 ? 0.45 : 1, tip: i > 2 ? `Titolo I (all. 7): <b>${eur(pf.t1[i])}</b><br>riduzione disposta a decorrere dal 2029` : `Titolo I (all. 7), ${y}${i === 2 ? " e successivi" : ""}: <b>${eur(pf.t1[i])}</b><br>di cui predeterminate per legge: ${eur(pf.p1[i])}` },
      ];
      for (const p of parts) {
        if (p.v <= 0) continue;
        const hh = p.v * sc;
        s += `<rect class="bar down" x="${x}" y="${yy}" width="${w}" height="${hh}" rx="4" fill="${p.c}" fill-opacity="${p.o || 1}" data-tip="${esc(p.tip)}"/>`;
        yy += hh;
      }
      if (pf.inc[i] > 0) { const hh = pf.inc[i] * sc; s += `<rect class="bar up" x="${x}" y="${zero - hh}" width="${w}" height="${hh}" rx="4" fill="var(--inc)" data-tip="${esc(`Incremento Titolo II (all. 6), ${y}: <b>${eur(pf.inc[i])}</b>`)}"/>`; }
      const tot = pf.inc[i] + pf.t2[i] + pf.t1[i];
      const ly = tot >= 0 ? zero - pf.inc[i] * sc - 8 : yy + 16;
      if (tot) s += `<text class="val" x="${cx}" y="${Math.max(12, Math.min(h - bot + 4, ly))}" text-anchor="middle">${esc(eurS(tot))}</text>`;
      s += `<text x="${cx}" y="${h - 8}" text-anchor="middle">${y}</text>`;
    });
    return s + "</svg>";
  }

  function chartH(items, { W = 680, lab = 210, row = 34 } = {}) {
    const m = Math.max(1, ...items.map((d) => sum(d.parts.map((p) => p.v))));
    const pw = W - lab - 110, h = items.length * row;
    let s = `<svg viewBox="0 0 ${W} ${h}" role="img">`;
    items.forEach((d, i) => {
      const y = i * row;
      s += `<text class="lab" x="${lab - 12}" y="${y + row / 2 + 4}" text-anchor="end">${esc(d.label)}</text>`;
      let x = lab;
      for (const p of d.parts) {
        const w = (p.v / m) * pw;
        if (w > 0) s += `<rect class="bar h" style="transition-delay:${(i * 0.04).toFixed(2)}s${d.go ? ";cursor:pointer" : ""}" x="${x}" y="${y + 7}" width="${Math.max(w, 1.5)}" height="${row - 14}" rx="5" fill="${p.c}" data-tip="${esc(p.tip)}"${d.go ? ` data-go="${esc(d.go)}"` : ""}/>`;
        x += w;
      }
      s += `<text class="val" x="${x + 10}" y="${y + row / 2 + 4}">${esc(d.note || "")}</text>`;
    });
    return s + "</svg>";
  }

  function chartDiv(items, { W = 680, lab = 210, row = 34 } = {}) {
    const m = Math.max(1, ...items.map((d) => Math.max(d.neg, d.pos)));
    const half = (W - lab - 16) / 2, cx = lab + half, h = items.length * row;
    let s = `<svg viewBox="0 0 ${W} ${h}" role="img"><line x1="${cx}" x2="${cx}" y1="0" y2="${h}" stroke="currentColor" stroke-opacity=".25"/>`;
    items.forEach((d, i) => {
      const y = i * row, wn = (d.neg / m) * half, wp = (d.pos / m) * half, dl = `transition-delay:${(i * 0.04).toFixed(2)}s`;
      s += `<text class="lab" x="${lab - 12}" y="${y + row / 2 + 4}" text-anchor="end">${esc(d.label)}</text>`;
      if (wn > 0) s += `<rect class="bar hl" style="${dl}" x="${cx - wn}" y="${y + 7}" width="${wn}" height="${row - 14}" rx="5" fill="var(--cut)" data-tip="${esc(d.tn)}"/>`;
      if (wp > 0) s += `<rect class="bar h" style="${dl}" x="${cx}" y="${y + 7}" width="${wp}" height="${row - 14}" rx="5" fill="var(--inc)" data-tip="${esc(d.tp)}"/>`;
    });
    return s + "</svg>";
  }

  function chartSaldi(mode) {
    const a = D.a1, W = 680, h = 280, top = 20, bot = 34;
    const series = [{ k: "saldo_netto", c: "var(--blue)", l: "Saldo netto da finanziare" }, { k: "ricorso_mercato", c: "#a259ff", l: "Ricorso al mercato" }];
    const m = Math.max(...series.flatMap((s) => a[mode][s.k]));
    const gw = (W - 20) / 3, bw = Math.min(70, gw * 0.3);
    let s = `<svg viewBox="0 0 ${W} ${h}" role="img">`;
    a.anni.forEach((y, i) => {
      const gx = 10 + gw * i + gw / 2;
      series.forEach((se, j) => {
        const v = a[mode][se.k][i], hh = (v / m) * (h - top - bot), x = gx + (j - 1) * (bw + 8) + 4;
        s += `<rect class="bar up" x="${x}" y="${h - bot - hh}" width="${bw}" height="${hh}" rx="6" fill="${se.c}" data-tip="${esc(`${se.l} (${mode}), ${y}: <b>${nf0.format(v)} mln €</b>`)}"/>`;
        s += `<text class="val" x="${x + bw / 2}" y="${h - bot - hh - 8}" text-anchor="middle">${nf0.format(v / 1000)} mld</text>`;
      });
      s += `<text x="${gx}" y="${h - 8}" text-anchor="middle">${y}</text>`;
    });
    return s + "</svg>";
  }

  const legendProfile = `<div class="legend"><span><i style="background:var(--cut)"></i>Riduzioni Titolo II, conto capitale (all. 5)</span><span><i style="background:var(--t1)"></i>Riduzioni Titolo I, spese correnti (all. 7)</span><span><i style="background:var(--inc)"></i>Incrementi Titolo II (all. 6)</span></div>`;

  // ---------------- ricerca negli articoli ----------------
  const STOP = new Set("della delle dello degli dei del di da in con per tra fra sul sulla sui nelle nella negli nei alla alle allo agli ai al e ed o a il lo la le gli un una uno che non piu altri altre altro loro anche come dal dai dalle dalla".split(" "));
  function artIndex(a) {
    if (!a._s) a._s = { r: fold(a.rubrica), t: fold(a.commi.join(" ")), rt: fold((a.rt || []).map((b) => b.s).join(" ")) };
    return a._s;
  }
  function terms(q) { return fold(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)); }
  const count = (s, w) => { let n = 0, i = 0; while ((i = s.indexOf(w, i)) !== -1) { n++; i += w.length; } return n; };
  function searchArts(q) {
    const ws = terms(q);
    if (!ws.length) return [];
    return D.art.map((a) => {
      const x = artIndex(a);
      let score = 0;
      for (const w of ws) {
        const r = count(x.r, w), t = count(x.t, w), rt = count(x.rt, w);
        if (!r && !t && !rt) return null;
        score += r * 10 + t * 2 + rt;
      }
      return { a, score };
    }).filter(Boolean).sort((p, q2) => q2.score - p.score).map((x) => x.a);
  }
  // parole chiave significative di un nome di missione/programma
  const GENERIC = new Set("politiche servizi servizio sviluppo tutela interventi intervento sistema sistemi generali generale amministrazioni amministrazione programma attivita gestione supporto settore competenza affari indirizzo politico coordinamento programmazione valorizzazione promozione strutture pubbliche pubblica pubblico materia territorio territoriali nazionale nazionali risorse ambito relative relativi finanziaria finanziarie".split(" "));
  function keywords(...names) {
    const out = [];
    for (const n of names) for (const w of terms(n)) if (w.length >= 5 && !GENERIC.has(w)) { const st = w.slice(0, Math.min(w.length, 7)); if (!out.includes(st)) out.push(st); }
    return out;
  }
  function relatedArts(kws, minK) {
    const res = [];
    for (const a of D.art) {
      if (a.sezione === "II") continue;
      const x = artIndex(a);
      let r = 0, t = 0;
      for (const k of kws) { r += count(x.r, k); t += count(x.t, k); }
      const cites = minK ? (a.ministeri[minK] || 0) : 0;
      if (r > 0 || t >= 3 || (cites && t >= 1)) res.push({ a, score: r * 10 + t + cites * 2 });
    }
    return res.sort((p, q) => q.score - p.score).map((x) => x.a);
  }

  // ---------------- componenti ----------------
  function artCard(a, extra = "") {
    const cites = Object.keys(a.ministeri || {}).length;
    return `<button class="art reveal" data-art="${a.n}">
      <span class="a-n">Articolo ${a.n}</span>
      <span class="a-t">${esc(a.rubrica)}</span>
      <span class="a-m">${a.importi.length ? `<span class="badge">${a.importi.length} ${a.importi.length === 1 ? "comma" : "commi"} con importi</span>` : ""}${a.rt ? `<span class="badge g">Relazione tecnica</span>` : ""}${a.n === 135 ? `<span class="badge r">Fonte delle riduzioni</span>` : ""}${extra}</span>
    </button>`;
  }
  function artGrid(list, limit = 8, id = "arts") {
    if (!list.length) return `<p class="empty">Nessun articolo trovato.</p>`;
    const shown = list.slice(0, limit);
    return `<div class="arts" id="${id}">${shown.map((a) => artCard(a)).join("")}</div>
      ${list.length > limit ? `<div class="more center"><button class="pill ghost small" data-more="${id}" data-list="${list.map((a) => a.n).join(",")}">Mostra tutti i ${list.length} articoli</button></div>` : ""}`;
  }
  function progCard(p) {
    const pf = profile([p]);
    return `<button class="prog reveal" data-go="#/programma/${enc(p.min)}/${enc(p.cod)}">
      <span class="p-e">${esc(D.minBy[p.min].breve)} · Programma ${esc(p.cod)}</span>
      <span class="p-t">${esc(p.prg)}</span>
      <span class="p-n">
        ${pf.cut2 ? `<div><b class="cut">${eurS(pf.cut2)}</b>Titolo II 2027-29</div>` : ""}
        ${pf.cut1 ? `<div><b class="t1">${eurS(pf.cut1)}</b>Titolo I 2027-29</div>` : ""}
        ${pf.incT ? `<div><b class="inc">+${eurS(pf.incT)}</b>Titolo II 2030-32</div>` : ""}
      </span>
    </button>`;
  }
  function progGrid(ps, limit = 8) {
    return `<div class="progs" id="pg">${ps.slice(0, limit).map(progCard).join("")}</div>${ps.length > limit ? `<div class="more center"><button class="pill ghost small" data-moreprog="${ps.map((p) => p.key).join(",")}">Mostra tutti i ${ps.length} programmi</button></div>` : ""}`;
  }
  function statsBlock(pf, nArts) {
    const st = [];
    if (pf.cut2) st.push(`<div class="stat reveal"><div class="n cut" data-count="${pf.cut2}">${eurS(pf.cut2)}</div><div class="l">Riduzioni conto capitale 2027-2029 (all. 5)</div></div>`);
    if (pf.cut1) st.push(`<div class="stat reveal d1"><div class="n t1" data-count="${pf.cut1}">${eurS(pf.cut1)}</div><div class="l">Riduzioni spese correnti 2027-2029 (all. 7), poi ${eurS(pf.regime1)} l'anno</div></div>`);
    if (pf.incT) st.push(`<div class="stat reveal d2"><div class="n inc" data-count="${pf.incT}" data-sign="+">+${eurS(pf.incT)}</div><div class="l">Reiscrizione in conto capitale 2030-2032 (all. 6)</div></div>`);
    if (nArts != null) st.push(`<div class="stat reveal d3"><div class="n plain" data-count="${nArts}" data-int="1">${nArts}</div><div class="l">Articoli collegati</div></div>`);
    return st.length ? `<div class="stats">${st.join("")}</div>` : "";
  }
  function numbersTable(list) {
    const row = (lab, r, cls, yrs) => r ? `<tr><td>${lab}</td>${r.v.map((v, i) => `<td class="n ${cls}">${eur(v)}<div class="tiny muted">per legge: ${eur(r.p[i])}</div></td>`).join("")}<td class="small muted">${yrs}</td></tr>` : "";
    return `<div class="tbl-wrap"><table><thead><tr><th>Allegato</th><th class="n">1° anno</th><th class="n">2° anno</th><th class="n">3° anno</th><th>Anni</th></tr></thead><tbody>
      ${list.map((x) => `${list.length > 1 ? `<tr class="lv0"><td colspan="5">${esc(x.label)}</td></tr>` : ""}
        ${row("All. 5 · riduzioni Titolo II", x.a5, "neg", "2027, 2028, 2029")}
        ${row("All. 7 · riduzioni Titolo I", x.a7, "neg", "2027, 2028, 2029 e successivi")}
        ${row("All. 6 · incrementi Titolo II", x.a6, "pos", "2030, 2031, 2032")}`).join("")}
      </tbody></table></div>`;
  }
  const footer = () => `<footer class="foot"><div class="in-w">Fonti: testo del disegno di legge di bilancio 2027-2029 (articoli e allegati 1, 5, 6, 7) e Relazione tecnica. Le tabelle degli allegati 5-7 sono immagini nel PDF: i valori sono stati letti con OCR e verificati con i totali di programma, missione, Ministero e allegato. <a href="#/fonti">Metodo e limiti</a>.</div></footer>`;

  // ---------------- viste ----------------
  const V = {};

  V.home = () => {
    const t5 = D.tot["5"], t7 = D.tot["7"];
    return `<section class="hero">
      <p class="eyebrow reveal">Disegno di legge di bilancio</p>
      <h1 class="h-xl reveal d1"><span class="grad">2027-2029.</span><br>Letto da vicino.</h1>
      <p class="lead reveal d2">${D.art.length} articoli, la Relazione tecnica e ${eurS(-sum(t5.v) - sum(t7.v))} di riduzioni ai Ministeri nel triennio. In una lettura guidata.</p>
      <div class="ask reveal d3">
        <div class="ask-q">Ti interessa qualcosa di particolare?</div>
        <div class="ask-b">
          <a class="pill primary" href="#/scegli">Sì</a>
          <a class="pill ghost" href="#/tutto">No, fammi vedere tutto</a>
        </div>
      </div>
    </section>`;
  };

  V.scegli = () => `<section class="sec"><div class="in-w center">
      <p class="eyebrow reveal">Esplora</p>
      <h1 class="h-l reveal d1">Da dove vuoi partire?</h1>
      <p class="lead reveal d2">Scegli una porta d'ingresso. Ogni strada porta agli articoli e, scorrendo, ai numeri.</p>
      <div class="tiles">
        <a class="tile big reveal" href="#/ministeri"><span class="t-ico">${ICO.min}</span><span class="t-h">Ministero</span><span class="t-s">Gli articoli che lo citano, le riduzioni e i programmi coinvolti.</span><span class="arrow">›</span></a>
        <a class="tile big reveal d1" href="#/missioni"><span class="t-ico">${ICO.mis}</span><span class="t-h">Missione e programma</span><span class="t-s">Un settore di spesa con tutti i suoi programmi, anche tra più Ministeri.</span><span class="arrow">›</span></a>
        <a class="tile big reveal d2" href="#/argomento"><span class="t-ico">${ICO.arg}</span><span class="t-h">Argomento</span><span class="t-s">Una ricerca libera nel testo della legge e nella Relazione tecnica.</span><span class="arrow">›</span></a>
      </div>
    </div></section>${footer()}`;

  V.ministeri = () => {
    const tiles = D.min.map((m, i) => {
      const pf = profile(progsOf((p) => p.min === m.k));
      const n = D.art.filter((a) => a.ministeri[m.k] || a.stato_previsione === m.k).length;
      const cut = pf.cut1 + pf.cut2;
      return { m, cut, n, i };
    }).sort((a, b) => a.cut - b.cut);
    return `<section class="sec gray"><div class="in-w">
      <div class="crumbs"><a href="#/scegli">Esplora</a> › Ministero</div>
      <h1 class="h-l reveal">Scegli un Ministero.</h1>
      <p class="lead reveal d1">Ordinati per riduzioni complessive 2027-2029 (allegati 5 e 7).</p>
      <div class="tiles">${tiles.map((t, i) => `<a class="tile reveal d${i % 3}" href="#/ministero/${t.m.k}"><span class="t-h">${esc(t.m.breve)}</span><span class="t-s">${t.n} articoli collegati</span><span class="t-v">${t.cut ? `<span class="neg">${eurS(t.cut)}</span> <small>2027-29</small>` : `<small>Nessuna riduzione art. 135</small>`}</span><span class="arrow">›</span></a>`).join("")}</div>
    </div></section>${footer()}`;
  };

  V.missioni = () => {
    const list = [...D.mis.values()].map((m) => {
      const ps = [...m.progs].map((k) => D.progs.get(k));
      const pf = profile(ps);
      return { m, ps, cut: pf.cut1 + pf.cut2, nm: new Set(ps.map((p) => p.min)).size };
    }).sort((a, b) => a.cut - b.cut);
    return `<section class="sec gray"><div class="in-w">
      <div class="crumbs"><a href="#/scegli">Esplora</a> › Missione e programma</div>
      <h1 class="h-l reveal">Scegli una missione.</h1>
      <p class="lead reveal d1">Le missioni sono i grandi settori della spesa dello Stato. Aprendone una trovi tutti i programmi interessati dalla manovra.</p>
      <div class="tiles">${list.map((x, i) => `<a class="tile reveal d${i % 3}" href="#/missione/${x.m.k}"><span class="t-s">Missione ${x.m.k}</span><span class="t-h">${esc(x.m.nome)}</span><span class="t-s">${x.ps.length} programmi · ${x.nm} ${x.nm === 1 ? "Ministero" : "Ministeri"}</span><span class="t-v"><span class="neg">${eurS(x.cut)}</span> <small>2027-29</small></span><span class="arrow">›</span></a>`).join("")}</div>
    </div></section>${footer()}`;
  };

  const SUGG = ["sanità", "pensioni", "casa", "energia", "scuola", "università", "imprese", "Forze di polizia", "famiglie", "Regioni", "infrastrutture", "cultura", "giovani", "tabacchi", "Irpef"];
  V.argomento = (q = "") => {
    q = dec(q || "");
    const arts = q ? searchArts(q) : [];
    const ws = terms(q);
    const progs = q ? progsOf((p) => ws.some((w) => fold(p.prg + " " + p.mis).includes(w))) : [];
    return `<section class="sec"><div class="in-n">
      <div class="crumbs"><a href="#/scegli">Esplora</a> › Argomento</div>
      <h1 class="h-l reveal">Cerca un argomento.</h1>
      <p class="lead reveal d1">La ricerca scorre il testo dei ${D.art.length} articoli e la Relazione tecnica.</p>
      <form class="search reveal d2" id="sform"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="sq" type="search" placeholder="Es. sanità, pensioni, casa" value="${esc(q)}" autocomplete="off" aria-label="Cerca un argomento"></form>
      <div class="chips reveal d3">${SUGG.map((s) => `<button class="chip ${fold(s) === fold(q) ? "on" : ""}" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    </div></section>
    ${q ? `<section class="sec tight gray"><div class="in-w">
      <p class="eyebrow">Risultati per "${esc(q)}"</p>
      <h2 class="h-m reveal">${arts.length} ${arts.length === 1 ? "articolo" : "articoli"}${progs.length ? ` e ${progs.length} ${progs.length === 1 ? "programma" : "programmi"}` : ""}.</h2>
      ${artGrid(arts, 10)}
    </div></section>
    ${progs.length ? `<section class="sec tight"><div class="in-w">
      <p class="eyebrow">Programmi con questo argomento nel nome</p>
      <h2 class="h-m reveal">I numeri della manovra.</h2>
      <div class="card mt reveal chart-wrap"><div class="chart">${chartProfile(profile(progs))}</div>${legendProfile}</div>
      <div class="progs">${progs.map(progCard).join("")}</div>
    </div></section>` : ""}` : ""}
    ${footer()}`;
  };

  function schedaHeader(eyebrow, title, crumbs) {
    return `<div class="crumbs">${crumbs}</div><p class="eyebrow reveal">${esc(eyebrow)}</p><h1 class="h-l reveal d1">${esc(title)}</h1>`;
  }

  V.ministero = (k) => {
    const m = D.minBy[k];
    if (!m) return V.ministeri();
    const ps = progsOf((p) => p.min === k);
    const pf = profile(ps);
    const sp = D.art.find((a) => a.stato_previsione === k);
    const cit = D.art.filter((a) => a.ministeri[k] && a.n !== 135).sort((a, b) => b.ministeri[k] - a.ministeri[k] || a.n - b.n);
    const arts = [...(ps.length ? [D.artBy[135]] : []), ...(sp ? [sp] : []), ...cit];
    // per missione
    const byMis = new Map();
    for (const p of ps) { const o = byMis.get(p.cmis) || { label: p.mis, list: [] }; o.list.push(p); byMis.set(p.cmis, o); }
    const misItems = [...byMis.entries()].map(([c, o]) => { const f = profile(o.list); return { label: o.label.length > 34 ? o.label.slice(0, 33) + "…" : o.label, go: `#/missione/${c}`, tot: f.cut1 + f.cut2, parts: [{ v: -f.cut2, c: "var(--cut)", tip: `<b>${esc(o.label)}</b><br>Titolo II 2027-29: ${eur(f.cut2)}` }, { v: -f.cut1, c: "var(--t1)", tip: `<b>${esc(o.label)}</b><br>Titolo I 2027-29: ${eur(f.cut1)}` }] }; }).sort((a, b) => a.tot - b.tot);
    misItems.forEach((d) => (d.note = eurS(d.tot)));
    return `<section class="sec"><div class="in-w">
      ${schedaHeader("Ministero", m.breve, `<a href="#/scegli">Esplora</a> › <a href="#/ministeri">Ministero</a> › ${esc(m.breve)}`)}
      ${ps.length ? `<p class="lead reveal d2">${ps.length} programmi interessati dalle norme di revisione della spesa (art. 135) e ${arts.length} articoli collegati.</p>` : `<p class="lead reveal d2">Il Ministero non compare negli allegati dell'art. 135. Qui trovi gli articoli che lo riguardano.</p>`}
      ${statsBlock(pf, arts.length)}
    </div></section>
    <section class="sec gray"><div class="in-w">
      <p class="eyebrow reveal">Gli articoli</p>
      <h2 class="h-m reveal d1">Cosa dice la legge.</h2>
      <p class="lead reveal d2 small">Prima l'art. 135 (da cui vengono i numeri)${sp ? " e lo stato di previsione del Ministero" : ""}, poi gli articoli che citano il Ministero, ordinati per numero di citazioni.</p>
      ${artGrid(arts, 8)}
    </div></section>
    ${ps.length ? `<section class="sec"><div class="in-w">
      <p class="eyebrow reveal">I numeri</p>
      <h2 class="h-m reveal d1">Riduzioni e reiscrizioni, anno per anno.</h2>
      <div class="mt">
        <div class="card reveal"><h3 class="h-s">Profilo 2027-2032</h3>${legendProfile}<div class="chart">${chartProfile(pf)}</div></div>
        <div class="card reveal mt"><h3 class="h-s">Per missione, 2027-2029</h3><div class="legend"><span><i style="background:var(--cut)"></i>Titolo II</span><span><i style="background:var(--t1)"></i>Titolo I</span></div><div class="chart">${chartH(misItems, { lab: 250 })}</div></div>
      </div>
      <div class="card mt reveal"><h3 class="h-s">Il dettaglio dell'allegato</h3>${numbersTable([{ label: m.breve, ...(D.minAl[k] || {}) }])}</div>
    </div></section>
    <section class="sec gray"><div class="in-w">
      <p class="eyebrow reveal">Le schede</p>
      <h2 class="h-m reveal d1">${ps.length} programmi.</h2>
      ${progGrid(ps.sort((a, b) => (profile([a]).cut1 + profile([a]).cut2) - (profile([b]).cut1 + profile([b]).cut2)))}
    </div></section>` : ""}
    ${footer()}`;
  };

  V.missione = (c) => {
    const ms = D.mis.get(c);
    if (!ms) return V.missioni();
    const ps = [...ms.progs].map((k) => D.progs.get(k));
    const pf = profile(ps);
    const kws = keywords(ms.nome);
    const arts = [D.artBy[135], ...relatedArts(kws).filter((a) => a.n !== 135)];
    const mins = [...new Set(ps.map((p) => p.min))];
    return `<section class="sec"><div class="in-w">
      ${schedaHeader("Missione " + c, ms.nome, `<a href="#/scegli">Esplora</a> › <a href="#/missioni">Missione</a> › ${esc(ms.nome)}`)}
      <p class="lead reveal d2">${ps.length} programmi in ${mins.length} ${mins.length === 1 ? "Ministero" : "Ministeri"}: ${mins.map((k) => esc(D.minBy[k].breve)).join(", ")}.</p>
      ${statsBlock(pf, arts.length)}
    </div></section>
    <section class="sec gray"><div class="in-w">
      <p class="eyebrow reveal">Gli articoli</p>
      <h2 class="h-m reveal d1">Cosa dice la legge.</h2>
      <p class="lead reveal d2 small">L'art. 135 dispone le riduzioni. Gli altri articoli sono quelli che contengono le parole chiave della missione: è un collegamento testuale, da verificare leggendo.</p>
      <div class="chips">${kws.map((k) => `<button class="chip" data-q="${esc(k)}">${esc(k)}…</button>`).join("")}</div>
      ${artGrid(arts, 8)}
    </div></section>
    <section class="sec"><div class="in-w">
      <p class="eyebrow reveal">I numeri</p>
      <h2 class="h-m reveal d1">Il profilo della missione.</h2>
      <div class="card mt reveal">${legendProfile}<div class="chart">${chartProfile(pf)}</div></div>
    </div></section>
    <section class="sec gray"><div class="in-w">
      <p class="eyebrow reveal">Le schede</p>
      <h2 class="h-m reveal d1">Tutti i programmi della missione.</h2>
      ${progGrid(ps)}
    </div></section>${footer()}`;
  };

  V.programma = (mk, cod) => {
    const p = D.progs.get(mk + "/" + dec(cod || ""));
    if (!p) return V.missioni();
    const m = D.minBy[p.min], pf = profile([p]);
    const kws = keywords(p.prg);
    const arts = [D.artBy[135], ...relatedArts(kws, p.min).filter((a) => a.n !== 135)];
    const sib = progsOf((x) => x.cmis === p.cmis && x.key !== p.key);
    return `<section class="sec"><div class="in-w">
      ${schedaHeader(`${m.breve} · Programma ${p.cod}`, p.prg, `<a href="#/scegli">Esplora</a> › <a href="#/ministero/${p.min}">${esc(m.breve)}</a> › <a href="#/missione/${p.cmis}">${esc(p.mis)}</a> › Programma ${esc(p.cod)}`)}
      <p class="lead reveal d2">Missione ${esc(p.cmis)}: ${esc(p.mis)}.</p>
      ${statsBlock(pf, arts.length)}
    </div></section>
    <section class="sec gray"><div class="in-w">
      <p class="eyebrow reveal">Gli articoli</p>
      <h2 class="h-m reveal d1">Cosa dice la legge.</h2>
      <p class="lead reveal d2 small">L'art. 135 dispone le riduzioni. Gli altri articoli contengono le parole chiave del programma${kws.length ? "" : " (nessuna parola chiave specifica nel nome)"}: collegamento testuale, da verificare leggendo.</p>
      <div class="chips">${kws.map((k) => `<button class="chip" data-q="${esc(k)}">${esc(k)}…</button>`).join("")}</div>
      ${artGrid(arts, 6)}
    </div></section>
    <section class="sec"><div class="in-w">
      <p class="eyebrow reveal">I numeri</p>
      <h2 class="h-m reveal d1">Anno per anno.</h2>
      <div class="card mt reveal">${legendProfile}<div class="chart">${chartProfile(pf)}</div></div>
      <div class="card mt reveal"><h3 class="h-s">I valori degli allegati</h3>${numbersTable([p])}
      <p class="small muted mt-s">"Per legge" indica la quota delle riduzioni predeterminata per legge, come riportata negli allegati.</p></div>
    </div></section>
    ${sib.length ? `<section class="sec gray"><div class="in-w"><p class="eyebrow reveal">Nella stessa missione</p><h2 class="h-m reveal d1">Altri programmi.</h2><div class="progs">${sib.map(progCard).join("")}</div></div></section>` : ""}
    ${footer()}`;
  };

  // ---------------- panoramica completa ----------------
  const ST = { year: 0, mode: "competenza", tree: "ministero", open: new Set() };
  V.tutto = () => {
    const t5 = D.tot["5"], t6 = D.tot["6"], t7 = D.tot["7"];
    const cut5 = -sum(t5.v), cut7 = -sum(t7.v), inc6 = sum(t6.v);
    const y = ST.year;
    const minItems = D.min.filter((m) => D.minAl[m.k]).map((m) => {
      const a = D.minAl[m.k], c2 = a.a5 ? -a.a5.v[y] : 0, c1 = a.a7 ? -a.a7.v[y] : 0;
      return { label: m.breve.length > 30 ? m.breve.slice(0, 29) + "…" : m.breve, go: `#/ministero/${m.k}`, tot: c1 + c2, note: eurS(-(c1 + c2)), parts: [{ v: c2, c: "var(--cut)", tip: `<b>${esc(m.breve)}</b><br>Titolo II, ${YEARS[y]}: ${eur(-c2)}` }, { v: c1, c: "var(--t1)", tip: `<b>${esc(m.breve)}</b><br>Titolo I, ${YEARS[y]}${y === 2 ? " e successivi" : ""}: ${eur(-c1)}` }] };
    }).sort((a, b) => b.tot - a.tot);
    const divItems = D.min.filter((m) => D.minAl[m.k]).map((m) => { const a = D.minAl[m.k], n = a.a5 ? -sum(a.a5.v) : 0, p = a.a6 ? sum(a.a6.v) : 0; return { label: m.breve.length > 30 ? m.breve.slice(0, 29) + "…" : m.breve, neg: n, pos: p, tn: `<b>${esc(m.breve)}</b><br>Riduzioni 2027-29: ${eur(-n)}`, tp: `<b>${esc(m.breve)}</b><br>Incrementi 2030-32: ${eur(p)}` }; }).sort((a, b) => b.neg - a.neg);
    const top = [...D.progs.values()].map((p) => ({ p, c: -((p.a5 ? p.a5.v[y] : 0) + (p.a7 ? p.a7.v[y] : 0)) })).sort((a, b) => b.c - a.c).slice(0, 6);
    return `<section class="hero" style="min-height:auto;padding:110px 22px 100px">
      <p class="eyebrow reveal">Tutto il disegno di legge</p>
      <h1 class="h-xl reveal d1">La manovra<br><span class="grad">in quattro numeri.</span></h1>
      <div class="stats in-w" style="width:100%;text-align:left">
        <div class="stat reveal"><div class="n cut" data-count="${cut5}">${eurS(cut5)}</div><div class="l">Riduzioni in conto capitale 2027-2029 (art. 135, c. 1, all. 5)</div></div>
        <div class="stat reveal d1"><div class="n inc" data-count="${inc6}" data-sign="+">+${eurS(inc6)}</div><div class="l">Reiscritti nel 2030-2032 (all. 6): il ${pct(inc6 / cut5)} dei tagli in conto capitale</div></div>
        <div class="stat reveal d2"><div class="n t1" data-count="${cut7}">${eurS(cut7)}</div><div class="l">Riduzioni di spesa corrente 2027-2029 (art. 135, c. 2, all. 7), poi ${eurS(-t7.v[2])} l'anno</div></div>
        <div class="stat reveal d3"><div class="n plain" data-count="${D.art.length}" data-int="1">${D.art.length}</div><div class="l">Articoli, di cui ${D.art.filter((a) => a.rt).length} con Relazione tecnica</div></div>
      </div>
    </section>
    <section class="sec"><div class="in-w">
      <p class="eyebrow reveal">Allegato 1 · Risultati differenziali</p>
      <h2 class="h-m reveal d1">I limiti del bilancio.</h2>
      <p class="lead reveal d2">Livelli massimi del saldo netto da finanziare e del ricorso al mercato fissati dall'art. 1.</p>
      <div class="card mt reveal"><div class="ctl"><div class="legend" style="margin:0"><span><i style="background:var(--blue)"></i>Saldo netto da finanziare</span><span><i style="background:#a259ff"></i>Ricorso al mercato</span></div>
        <span class="seg" data-seg="mode"><button data-v="competenza" class="${ST.mode === "competenza" ? "on" : ""}">Competenza</button><button data-v="cassa" class="${ST.mode === "cassa" ? "on" : ""}">Cassa</button></span></div>
        <div class="chart mt-s">${chartSaldi(ST.mode)}</div></div>
    </div></section>
    <section class="sec gray"><div class="in-w">
      <p class="eyebrow reveal">Art. 135 · Revisione della spesa</p>
      <h2 class="h-m reveal d1">Chi taglia, e quanto.</h2>
      <div class="mt">
        <div class="card reveal"><div class="ctl"><h3 class="h-s">Riduzioni per Ministero</h3><span class="seg" data-seg="year">${YEARS.slice(0, 3).map((yy, i) => `<button data-v="${i}" class="${i === y ? "on" : ""}">${yy}</button>`).join("")}</span></div>
          <div class="legend"><span><i style="background:var(--cut)"></i>Titolo II</span><span><i style="background:var(--t1)"></i>Titolo I</span></div><div class="chart">${chartH(minItems)}</div></div>
        <div class="card reveal mt"><h3 class="h-s">Tagliati oggi, reiscritti dopo</h3><p class="small muted">Conto capitale: riduzioni 2027-29 contro incrementi 2030-32.</p>
          <div class="legend"><span><i style="background:var(--cut)"></i>Riduzioni 2027-29</span><span><i style="background:var(--inc)"></i>Incrementi 2030-32</span></div><div class="chart">${chartDiv(divItems)}</div></div>
      </div>
    </div></section>
    <section class="sec"><div class="in-w">
      <p class="eyebrow reveal">I programmi più colpiti nel ${YEARS[y]}</p>
      <h2 class="h-m reveal d1">Dove pesano di più.</h2>
      <div class="progs">${top.map((x) => progCard(x.p)).join("")}</div>
    </div></section>
    <section class="sec gray"><div class="in-w">
      <p class="eyebrow reveal">Tutti i valori</p>
      <h2 class="h-m reveal d1">Per Ministero o per settore.</h2>
      <div class="card mt reveal">${treeTable()}</div>
    </div></section>
    <section class="sec dark"><div class="in-w center">
      <h2 class="h-l reveal">Vuoi andare a fondo?</h2>
      <p class="lead reveal d1">Leggi gli articoli con la loro Relazione tecnica, oppure parti da un Ministero, una missione o un argomento.</p>
      <div class="ask-b reveal d2"><a class="pill primary" href="#/articoli">Leggi gli articoli</a><a class="pill light" href="#/scegli">Esplora</a></div>
    </div></section>${footer()}`;
  };

  function treeTable() {
    const groups = new Map();
    for (const p of D.progs.values()) {
      const vals = [p.a5, p.a7].flatMap((r) => (r ? r.v : [0, 0, 0])).concat([p.a6 ? sum(p.a6.v) : 0]);
      const path = ST.tree === "ministero"
        ? [["m" + p.min, D.minBy[p.min].breve], ["mm" + p.min + p.cod.split(".")[0], p.mis], ["p" + p.key, p.cod + " " + p.prg, p]]
        : [["n" + p.cmis, p.cmis + " " + p.mis], ["nm" + p.cmis + p.min, D.minBy[p.min].breve], ["p" + p.key, p.cod + " " + p.prg, p]];
      let lvl = groups;
      path.forEach(([id, label, prog], d) => {
        let g = lvl.get(id);
        if (!g) { g = { id, label, d, prog, vals: vals.map(() => 0), kids: new Map() }; lvl.set(id, g); }
        vals.forEach((v, i) => (g.vals[i] += v));
        lvl = g.kids;
      });
    }
    let html = "";
    const walk = (m) => [...m.values()].sort((a, b) => (a.vals[0] + a.vals[3]) - (b.vals[0] + b.vals[3])).forEach((g) => {
      const open = ST.open.has(g.id), leaf = !g.kids.size;
      html += `<tr class="lv${g.d} click" ${leaf ? `data-go="#/programma/${enc(g.prog.min)}/${enc(g.prog.cod)}"` : `data-tog="${esc(g.id)}"`}><td>${leaf ? `<span class="tw">›</span>` : `<span class="tw ${open ? "open" : ""}">›</span>`}${esc(g.label)}</td>${g.vals.map((v) => `<td class="n ${v < 0 ? "neg" : v > 0 ? "pos" : ""}">${v ? eurS(v) : "-"}</td>`).join("")}</tr>`;
      if (open && !leaf) walk(g.kids);
    });
    walk(groups);
    return `<div class="ctl"><span class="seg" data-seg="tree"><button data-v="ministero" class="${ST.tree === "ministero" ? "on" : ""}">Per Ministero</button><button data-v="missione" class="${ST.tree === "missione" ? "on" : ""}">Per missione</button></span><span class="small muted">Tocca una riga per aprirla</span></div>
      <div class="tbl-wrap"><table><thead><tr><th></th><th class="n" colspan="3">All. 5 · Titolo II</th><th class="n" colspan="3">All. 7 · Titolo I</th><th class="n">All. 6</th></tr>
      <tr><th>${ST.tree === "ministero" ? "Ministero / missione / programma" : "Missione / Ministero / programma"}</th><th class="n">2027</th><th class="n">2028</th><th class="n">2029</th><th class="n">2027</th><th class="n">2028</th><th class="n">2029+</th><th class="n">2030-32</th></tr></thead><tbody>${html}</tbody></table></div>`;
  }

  // ---------------- articoli ----------------
  const AS = { q: "" };
  V.articoli = () => {
    const list = AS.q ? searchArts(AS.q) : D.art;
    let cur = "", html = "";
    for (const a of list) {
      const t = AS.q ? "Risultati" : a.titolo || "Sezione II";
      if (t !== cur) { if (cur) html += "</div>"; cur = t; html += `<h3 class="h-s mt reveal">${esc(cap(t))}</h3><div class="arts">`; }
      html += artCard(a);
    }
    if (cur) html += "</div>";
    return `<section class="sec"><div class="in-w">
      <p class="eyebrow reveal">L'articolato</p>
      <h1 class="h-l reveal d1">${D.art.length} articoli.</h1>
      <p class="lead reveal d2">Aprine uno per leggere il testo, con i commi che contengono importi in evidenza, e la Relazione tecnica che lo accompagna.</p>
      <form class="search reveal d3" id="aform"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="aq" type="search" placeholder="Filtra per parola" value="${esc(AS.q)}" autocomplete="off" aria-label="Filtra gli articoli"></form>
      <div id="alist">${html || `<p class="empty">Nessun articolo trovato.</p>`}</div>
    </div></section>${footer()}`;
  };

  V.fonti = () => `<section class="sec"><div class="in-n">
    <p class="eyebrow reveal">Metodo</p><h1 class="h-l reveal d1">Fonti e limiti.</h1>
    <div class="card mt reveal"><h3 class="h-s">Da dove vengono i dati</h3>
      <p>Tutto ciò che vedi viene da due documenti: il <b>testo del disegno di legge di bilancio 2027-2029</b> (articoli e allegati 1, 5, 6 e 7) e la <b>Relazione tecnica</b>. Non ci sono stime o dati esterni.</p>
      <p>Le tabelle degli allegati 5, 6 e 7 sono immagini nel PDF. I valori sono stati letti con OCR e accettati solo dopo il controllo incrociato: i programmi sommano alla missione, le missioni al Ministero, i Ministeri al totale di ogni allegato. Le poche correzioni manuali sono documentate nel codice con il numero di pagina.</p></div>
    <div class="card mt reveal"><h3 class="h-s">Cosa tenere presente</h3>
      <p>Gli importi degli allegati sono per Ministero, missione e programma: il disegno di legge non li ripartisce per capitolo.</p>
      <p>I collegamenti tra articoli e Ministeri indicano che l'articolo <b>cita</b> il Ministero nel testo. I collegamenti tra articoli e missioni o programmi sono <b>testuali</b> (parole chiave del nome): sono un punto di partenza, non un'attribuzione contabile.</p>
      <p>La Relazione tecnica è riportata così com'è; le tabelle conservano l'impaginazione originale. I "commi con importi" sono i commi che contengono cifre in euro, evidenziati senza elaborazioni.</p>
      <p>Le riduzioni dell'allegato 7 per il 2029 valgono anche per gli anni successivi ("2029 e successivi"): nei grafici gli anni 2030-2032 le mostrano in trasparenza.</p></div>
  </div></section>${footer()}`;

  // ---------------- foglio articolo ----------------
  let sheetQ = "";
  function hl(s) {
    s = esc(s);
    const ws = terms(sheetQ);
    if (!ws.length) return s;
    // evidenzia su testo con accenti: ricerca sulla versione "piegata" mantenendo gli indici
    const f = fold(s);
    const marks = [];
    for (const w of ws) { let i = 0; while ((i = f.indexOf(w, i)) !== -1) { marks.push([i, i + w.length]); i += w.length; } }
    if (!marks.length) return s;
    marks.sort((a, b) => a[0] - b[0]);
    let out = "", last = 0;
    for (const [a, b] of marks) { if (a < last) continue; out += s.slice(last, a) + "<mark>" + s.slice(a, b) + "</mark>"; last = b; }
    return out + s.slice(last);
  }
  function openArt(n, tab) {
    const a = D.artBy[n];
    if (!a) return;
    tab = tab || "ddl";
    const sh = $("#sheet"), bk = $("#sheet-back");
    const body = tab === "rt"
      ? `<div class="rt">${(a.rt || []).map((b) => (b.t === "pre" ? `<pre>${hl(b.s)}</pre>` : `<p>${hl(b.s)}</p>`)).join("")}</div>`
      : `${a.importi.length ? `<p class="small muted">I commi in evidenza contengono importi in euro.</p>` : ""}${a.commi.map((c, i) => `<div class="comma ${a.importi.includes(i) ? "imp" : ""}">${hl(c)}</div>`).join("")}
         ${n === 135 ? `<p class="mt-s"><a class="pill primary small" href="#/tutto" data-close>Vedi gli allegati 5, 6 e 7</a></p>` : ""}`;
    sh.innerHTML = `<div class="sheet-h"><button class="x" data-close aria-label="Chiudi">×</button>
      <div class="small muted">${esc(cap(a.titolo || ""))}${a.capo ? " · " + esc(cap(a.capo)) : ""}</div>
      <h2 class="h-s" id="sheet-title" style="margin-top:6px">Art. ${a.n} · ${esc(a.rubrica)}</h2>
      <div class="ctl mt-s"><span class="seg" data-sheet="${a.n}"><button data-v="ddl" class="${tab === "ddl" ? "on" : ""}">Testo del DDL</button>${a.rt ? `<button data-v="rt" class="${tab === "rt" ? "on" : ""}">Relazione tecnica</button>` : ""}</span>
      <span class="a-m">${Object.keys(a.ministeri).map((k) => `<a class="badge g" href="#/ministero/${k}" data-close>${esc(D.minBy[k].breve)}</a>`).join(" ")}</span></div></div>
      <div class="sheet-b">${body}</div>`;
    if (sh.hidden) {
      sh.hidden = false; bk.hidden = false; document.body.style.overflow = "hidden";
      requestAnimationFrame(() => { sh.classList.add("show"); bk.classList.add("show"); });
      lastFocus = document.activeElement; setTimeout(() => $(".x", sh).focus(), 50);
    }
  }
  let lastFocus = null;
  function closeSheet() {
    const sh = $("#sheet"), bk = $("#sheet-back");
    if (sh.hidden) return;
    sh.classList.remove("show"); bk.classList.remove("show"); document.body.style.overflow = "";
    setTimeout(() => { sh.hidden = true; bk.hidden = true; }, reduced ? 0 : 450);
    if (lastFocus) lastFocus.focus();
  }

  // ---------------- animazioni ----------------
  let io;
  function animate(root) {
    if (io) io.disconnect();
    const els = $$(".reveal, .chart", root);
    if (reduced || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("in");
      $$("[data-count]", en.target).concat(en.target.matches("[data-count]") ? [en.target] : []).forEach(countUp);
      io.unobserve(en.target);
    }), { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => io.observe(e));
  }
  function countUp(el) {
    if (el._done) return; el._done = true;
    const v = +el.dataset.count, isInt = el.dataset.int, sign = el.dataset.sign || "";
    const fmt = (x) => (isInt ? nf0.format(Math.round(x)) : sign + eurS(x));
    const t0 = performance.now(), dur = 1300;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(v * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function navTone() {
    const el = document.elementFromPoint(20, 60);
    $("#nav").classList.toggle("dark", !!(el && el.closest(".hero, .sec.dark")));
  }
  addEventListener("scroll", navTone, { passive: true });

  // ---------------- tooltip ----------------
  document.addEventListener("mousemove", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]"), el = $("#tip");
    if (!t) { el.hidden = true; return; }
    el.innerHTML = t.getAttribute("data-tip"); el.hidden = false;
    el.style.left = Math.min(e.clientX + 14, innerWidth - el.offsetWidth - 8) + "px";
    el.style.top = Math.min(e.clientY + 14, innerHeight - el.offsetHeight - 8) + "px";
  });

  // ---------------- routing ----------------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const [v, ...args] = parts;
    const map = { "": "home", scegli: "scegli", ministeri: "ministeri", ministero: "ministero", missioni: "missioni", missione: "missione", programma: "programma", argomento: "argomento", tutto: "tutto", articoli: "articoli", articolo: "articoli", fonti: "fonti" };
    const name = map[v || ""] || "home";
    sheetQ = name === "argomento" ? dec(args[0] || "") : name === "articoli" ? AS.q : "";
    return { name, args, art: v === "articolo" ? +args[0] : null };
  }
  function render(keepScroll) {
    const r = route(), y = scrollY;
    const html = V[r.name](...r.args);
    const app = $("#app");
    app.innerHTML = `<div class="view">${html}</div>`;
    $$(".nav-links a").forEach((a) => a.classList.toggle("on", a.dataset.nav === r.name || (a.dataset.nav === "scegli" && ["ministeri", "ministero", "missioni", "missione", "programma", "argomento"].includes(r.name))));
    document.title = (r.name === "home" ? "" : ($("h1", app)?.textContent || "") + " · ") + "Legge di bilancio 2027-2029";
    if (keepScroll) { scrollTo(0, y); $(".view", app).style.animation = "none"; } else scrollTo(0, 0);
    animate(app);
    navTone(); setTimeout(navTone, 120);
    if (r.art) openArt(r.art);
  }
  addEventListener("hashchange", () => { closeSheet(); render(false); });

  // ---------------- eventi ----------------
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-close]")) { closeSheet(); if (!t.closest("a")) e.preventDefault(); return; }
    if (t.id === "sheet-back") { closeSheet(); return; }
    const sb = t.closest("[data-sheet] button");
    if (sb) { openArt(+sb.parentElement.dataset.sheet, sb.dataset.v); $(".sheet-b").scrollTop = 0; return; }
    const art = t.closest("[data-art]");
    if (art) { openArt(+art.dataset.art); return; }
    const more = t.closest("[data-more]");
    if (more) { const box = $("#" + more.dataset.more); box.innerHTML = more.dataset.list.split(",").map((n) => artCard(D.artBy[n])).join(""); more.parentElement.remove(); animate(box.parentElement); return; }
    const mp = t.closest("[data-moreprog]");
    if (mp) { const box = $("#pg"); box.innerHTML = mp.dataset.moreprog.split(",").map((k) => progCard(D.progs.get(k))).join(""); mp.parentElement.remove(); animate(box.parentElement); return; }
    const chip = t.closest("[data-q]");
    if (chip) { location.hash = "#/argomento/" + enc(chip.dataset.q); return; }
    const go = t.closest("[data-go]");
    if (go && !t.closest("a")) { location.hash = go.dataset.go; return; }
    const tog = t.closest("[data-tog]");
    if (tog) { const id = tog.dataset.tog; ST.open.has(id) ? ST.open.delete(id) : ST.open.add(id); render(true); return; }
    const sg = t.closest("[data-seg] button");
    if (sg) { const k = sg.parentElement.dataset.seg; if (k === "year") ST.year = +sg.dataset.v; if (k === "mode") ST.mode = sg.dataset.v; if (k === "tree") { ST.tree = sg.dataset.v; ST.open.clear(); } render(true); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "sform") { const q = $("#sq").value.trim(); location.hash = "#/argomento/" + enc(q); }
  });
  let deb;
  document.addEventListener("input", (e) => {
    if (e.target.id !== "aq") return;
    clearTimeout(deb);
    deb = setTimeout(() => { AS.q = e.target.value; sheetQ = AS.q; const pos = e.target.selectionStart; render(true); const n = $("#aq"); n.focus(); n.setSelectionRange(pos, pos); }, 250);
  });

  load().then(() => render(false)).catch((err) => {
    $("#app").innerHTML = `<section class="sec"><div class="in-n"><h1 class="h-m">Dati non disponibili</h1><p class="lead">${esc(err.message)}. Se apri il file da disco, servi la cartella <code>docs/</code> con un web server (ad es. <code>python3 -m http.server</code>).</p></div></section>`;
  });
})();
