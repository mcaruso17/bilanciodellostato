/* Dashboard DDL di bilancio 2027-2029. Nessuna dipendenza esterna. */
(function () {
  "use strict";

  // ---------- utilita' ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf0 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fE = (n) => (n == null || isNaN(n) ? "n.d." : nf0.format(Math.round(n)));
  const fM = (n) => (n == null || isNaN(n) ? "n.d." : nf1.format(n / 1e6).replace(/^-(0,0)$/, "$1"));
  const fMl = (n) => (n == null || isNaN(n) ? "n.d." : Math.abs(n) >= 1e9 ? nf1.format(n / 1e9) + " mld" : nf1.format(n / 1e6) + " mln");
  const fP = (x) => (x == null || !isFinite(x) ? "n.d." : nf1.format(x * 100) + "%");
  const sgn = (n) => (n < 0 ? "neg" : n > 0 ? "pos" : "");
  const cap = (s) => { s = String(s || ""); return s === s.toUpperCase() ? (s.charAt(0) + s.slice(1).toLowerCase()).replace(/made in italy/g, "made in Italy").replace(/\b(inps|iva|ue|pnrr|cnel|ssn)\b/g, (m) => m.toUpperCase()) : s; };
  const minShort = (m) => cap(m).replace(/^Ministero (dell'|della |delle |del |degli |dei )?/i, "").replace(/^./, (c) => c.toUpperCase())
    .replace("Affari esteri e della cooperazione internazionale", "Affari esteri e coop. int.").replace("Agricoltura, della sovranita' alimentare e delle foreste", "Agricoltura e sovranità alim.");
  const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);

  const S = { al: null, lb: null, dlb: null, art: null, meta: null };
  const state = {
    pano: { year: 0 },
    set: { mode: "ministero", open: new Set(), sort: null },
    prog: { key: null, tit: 2, yi: 0, net: false, cuts: null, inc: null },
    pg: { amm: "", tit: "", cat: "", q: "", only: false, sort: "cp2", page: 0 },
    var: { amm: "", yi: 0, q: "", page: 0 },
    art: { q: "", tit: "" },
  };

  // ---------- caricamento ----------
  async function load() {
    const j = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
    const [al, lb, art] = await Promise.all([j("data/allegati.json"), j("data/lb_pg.json"), j("data/articoli.json")]);
    S.al = al.allegati; S.a4 = al.allegato4; S.meta = al.meta; S.lb = lb; S.art = art;
    if (al.meta.dlb) { try { S.dlb = await j("data/dlb_pg.json"); } catch (e) { S.dlb = null; } }
    index();
  }

  function colIndex(ds) { const c = {}; ds.cols.forEach((k, i) => (c[k] = i)); return c; }

  // Indici: baseline LB per programma e titolo; registro programmi degli allegati.
  function index() {
    const lb = S.lb, C = (S.lbC = colIndex(lb)), D = lb.dict;
    S.base = new Map(); S.baseMin = new Map(); S.misNaz = new Map();
    for (const r of lb.rows) {
      const amm = D[r[C.amm]], k = amm + "|" + r[C.udv1] + "|" + r[C.udv2];
      let b = S.base.get(k);
      if (!b) { b = { amm, mis: D[r[C.mis]], prg: D[r[C.prg]], t: { 1: [0, 0, 0], 2: [0, 0, 0], 3: [0, 0, 0] }, f: [0, 0, 0] }; S.base.set(k, b); }
      const t = b.t[r[C.tit]] || (b.t[r[C.tit]] = [0, 0, 0]);
      t[0] += r[C.cp1]; t[1] += r[C.cp2]; t[2] += r[C.cp3];
      if ((r[C.tit] === 1 || r[C.tit] === 2) && !S.meta.cat_rigide.includes(String(r[C.cat]))) { b.f[0] += r[C.cp1]; b.f[1] += r[C.cp2]; b.f[2] += r[C.cp3]; }
      let m = S.baseMin.get(amm); if (!m) S.baseMin.set(amm, (m = { 1: [0, 0, 0], 2: [0, 0, 0] }));
      if (r[C.tit] === 1 || r[C.tit] === 2) { m[r[C.tit]][0] += r[C.cp1]; m[r[C.tit]][1] += r[C.cp2]; m[r[C.tit]][2] += r[C.cp3]; }
    }
    // registro programmi colpiti
    S.progs = new Map();
    for (const r of S.al) {
      if (r.liv !== "programma") continue;
      const [u1, u2] = r.cod.split(".").map(Number);
      const key = r.min + "|" + u1 + "|" + u2;
      let p = S.progs.get(key);
      if (!p) {
        const b = S.base.get(key);
        p = { key, min: r.min, cod: r.cod, u1, u2, prg: b ? cap(b.prg.replace(/^\d+ /, "")) : r.prg, mis: b ? b.mis : (r.cmis.padStart(3, "0") + " " + r.mis), a5: null, a6: null, a7: null, base: b };
        S.progs.set(key, p);
      }
      p["a" + r.a] = r;
    }
    S.tot = {};
    for (const r of S.al) if (r.liv === "totale") S.tot[r.a] = r;
  }

  // ---------- tooltip ----------
  const tip = () => $("#tip");
  document.addEventListener("mousemove", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    const el = tip();
    if (!t) { el.hidden = true; return; }
    el.innerHTML = t.getAttribute("data-tip");
    el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.min(e.clientX + 14, innerWidth - w - 8) + "px";
    el.style.top = Math.min(e.clientY + 14, innerHeight - h - 8) + "px";
  });

  // ---------- grafici SVG ----------
  // barre orizzontali impilate: items [{label, parts:[{v, color, tip}], note}]
  function hbars(items, { width = 620, labelW = 190, row = 24, max } = {}) {
    const m = max || Math.max(1, ...items.map((d) => sum(d.parts.map((p) => p.v))));
    const plotW = width - labelW - 90, h = items.length * row + 6;
    let s = `<svg viewBox="0 0 ${width} ${h}" role="img">`;
    items.forEach((d, i) => {
      const y = i * row + 3;
      s += `<text x="${labelW - 8}" y="${y + row / 2 + 1}" text-anchor="end" dominant-baseline="middle">${esc(d.label)}</text>`;
      let x = labelW;
      d.parts.forEach((p) => {
        const w = (p.v / m) * plotW;
        if (w > 0) s += `<rect x="${x}" y="${y + 4}" width="${Math.max(w, 0.8)}" height="${row - 9}" rx="2" fill="${p.color}" data-tip="${esc(p.tip)}"></rect>`;
        x += w;
      });
      s += `<text x="${x + 6}" y="${y + row / 2 + 1}" dominant-baseline="middle" class="ax">${esc(d.note || "")}</text>`;
    });
    return s + "</svg>";
  }

  // barre divergenti: items [{label, neg, pos, tipN, tipP}]
  function divbars(items, { width = 620, labelW = 190, row = 24 } = {}) {
    const m = Math.max(1, ...items.map((d) => Math.max(Math.abs(d.neg), d.pos)));
    const half = (width - labelW - 20) / 2, cx = labelW + half, h = items.length * row + 6;
    let s = `<svg viewBox="0 0 ${width} ${h}" role="img"><line x1="${cx}" x2="${cx}" y1="0" y2="${h}" stroke="#9aa7b4"/>`;
    items.forEach((d, i) => {
      const y = i * row + 3, wn = (Math.abs(d.neg) / m) * half, wp = (d.pos / m) * half;
      s += `<text x="${labelW - 8}" y="${y + row / 2 + 1}" text-anchor="end" dominant-baseline="middle">${esc(d.label)}</text>`;
      if (wn > 0) s += `<rect x="${cx - wn}" y="${y + 4}" width="${wn}" height="${row - 9}" rx="2" fill="var(--cut)" data-tip="${esc(d.tipN)}"></rect>`;
      if (wp > 0) s += `<rect x="${cx}" y="${y + 4}" width="${wp}" height="${row - 9}" rx="2" fill="var(--inc)" data-tip="${esc(d.tipP)}"></rect>`;
    });
    return s + "</svg>";
  }

  // ---------- aggregazioni allegati ----------
  function minRows(a) { return S.al.filter((r) => r.a === a && r.liv === "ministero"); }
  function byMin() {
    const m = new Map();
    for (const a of ["5", "6", "7"]) for (const r of minRows(a)) {
      let o = m.get(r.min); if (!o) m.set(r.min, (o = { min: r.min }));
      o["a" + a] = r;
    }
    return [...m.values()];
  }
  const v = (r, i) => (r ? r.v[i] : 0);
  const p = (r, i) => (r ? r.p[i] : 0);

  // ---------- viste ----------
  const views = {};

  views.panoramica = () => {
    const y = state.pano.year, years = ["2027", "2028", "2029"];
    const t5 = S.tot["5"], t6 = S.tot["6"], t7 = S.tot["7"];
    const cut5 = sum(t5.v), inc6 = sum(t6.v), cut7 = sum(t7.v);
    const pred = (sum(t5.p) + sum(t7.p)) / (cut5 + cut7);
    const mins = byMin();
    const items = mins.map((o) => {
      const c2 = -v(o.a5, y), c1 = -v(o.a7, y);
      const b = S.baseMin.get(o.min), byi = y < 2 ? y + 1 : null; // LB 2026: idx1=2027, idx2=2028
      const den = b && byi != null ? b[1][byi] + b[2][byi] : null;
      return { o, label: minShort(o.min), tot: c1 + c2, den,
        parts: [
          { v: c2, color: "var(--cut)", tip: `<b>${esc(cap(o.min))}</b><br>Titolo II (all. 5), ${years[y]}: ${fMl(c2)}<br>di cui predeterminate per legge: ${fMl(-p(o.a5, y))}` },
          { v: c1, color: "var(--tit1)", tip: `<b>${esc(cap(o.min))}</b><br>Titolo I (all. 7), ${years[y]}${y === 2 ? " e successivi" : ""}: ${fMl(c1)}<br>di cui predeterminate per legge: ${fMl(-p(o.a7, y))}` },
        ] };
    }).sort((a, b) => b.tot - a.tot);
    items.forEach((d) => (d.note = fMl(d.tot) + (d.den ? " · " + fP(d.tot / d.den) + " LB" : "")));

    const div = mins.map((o) => ({ label: minShort(o.min), neg: sum(o.a5 ? o.a5.v : [0]), pos: sum(o.a6 ? o.a6.v : [0]),
      tipN: `<b>${esc(cap(o.min))}</b><br>Riduzioni Titolo II 2027-2029: ${fMl(-sum(o.a5 ? o.a5.v : [0]))}`,
      tipP: `<b>${esc(cap(o.min))}</b><br>Incrementi Titolo II 2030-2032: ${fMl(sum(o.a6 ? o.a6.v : [0]))}` }))
      .sort((a, b) => a.neg - b.neg);

    // top programmi
    const progs = [...S.progs.values()].map((pr) => {
      const c = -(v(pr.a5, y) + v(pr.a7, y));
      const byi = y < 2 ? y + 1 : null;
      const den = pr.base && byi != null ? pr.base.t[1][byi] + pr.base.t[2][byi] : null;
      return { pr, c, den, share: den ? c / den : null, nonpred: -(v(pr.a5, y) - p(pr.a5, y) + v(pr.a7, y) - p(pr.a7, y)) };
    }).sort((a, b) => b.c - a.c).slice(0, 15);

    return `
    <h1>Panoramica della manovra sulla spesa dei Ministeri</h1>
    <p class="lead">Riduzioni e rimodulazioni disposte dall'art. 135 del DDL di bilancio 2027-2029 (allegati 5, 6 e 7), confrontate con gli stanziamenti di competenza della Legge di bilancio 2026 per gli stessi programmi.</p>
    <div class="grid g4">
      <div class="card kpi cut"><div class="l">Riduzioni Titolo II 2027-29</div><div class="v">${fMl(-cut5)}</div><div class="s">All. 5, art. 135 c. 1 · di cui per legge ${fP(sum(t5.p) / cut5)}</div></div>
      <div class="card kpi inc"><div class="l">Incrementi Titolo II 2030-32</div><div class="v">${fMl(inc6)}</div><div class="s">All. 6 · reiscrizione del ${fP(inc6 / -cut5)} dei tagli</div></div>
      <div class="card kpi t1"><div class="l">Riduzioni Titolo I 2027-29+</div><div class="v">${fMl(-cut7)}</div><div class="s">All. 7, art. 135 c. 2 · ${fMl(-t7.v[2])} annui dal 2029</div></div>
      <div class="card kpi"><div class="l">Quota predeterminata per legge</div><div class="v">${fP(pred)}</div><div class="s">Su riduzioni Titolo I e II 2027-2029</div></div>
    </div>
    <div class="grid g2">
      <div class="card">
        <h2>Riduzioni per Ministero</h2>
        <div class="bar-ctl"><span class="seg" data-act="pano-year">${years.map((yy, i) => `<button data-v="${i}" class="${i === y ? "on" : ""}">${yy}</button>`).join("")}</span></div>
        <div class="legend"><span><i style="background:var(--cut)"></i>Titolo II, conto capitale (all. 5)</span><span><i style="background:var(--tit1)"></i>Titolo I, spese correnti (all. 7)</span></div>
        <div class="chart">${hbars(items)}</div>
        <p class="small muted">Percentuale: riduzione sul totale Titolo I+II stanziato per lo stesso anno nella LB 2026 (n.d. per il 2029, fuori dal triennio LB 2026).</p>
      </div>
      <div class="card">
        <h2>Spostamento nel tempo della spesa in conto capitale</h2>
        <p class="small muted" style="margin-top:-4px">Riduzioni 2027-2029 (all. 5) e incrementi 2030-2032 (all. 6) per Ministero: dove i tagli sono in larga parte reiscritti, si tratta di una rimodulazione temporale, non di un definanziamento.</p>
        <div class="legend"><span><i style="background:var(--cut)"></i>Riduzioni 2027-29</span><span><i style="background:var(--inc)"></i>Incrementi 2030-32</span></div>
        <div class="chart">${divbars(div)}</div>
      </div>
    </div>
    <div class="card flush">
      <div class="card-h"><h2>I 15 programmi con le riduzioni maggiori nel ${years[y]}</h2></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Ministero</th><th>Programma</th><th class="n">Riduzione (mln)</th><th class="n">Non predeterminata (mln)</th><th class="n">LB 2026 Tit. I+II (mln)</th><th class="n">% su LB</th></tr></thead>
        <tbody>${progs.map((d) => `<tr class="click" data-go="programma/${encodeURIComponent(d.pr.key)}"><td>${esc(minShort(d.pr.min))}</td><td>${esc(d.pr.cod)} ${esc(d.pr.prg)}</td><td class="n neg">${fM(-d.c)}</td><td class="n">${fM(d.nonpred)}</td><td class="n">${fM(d.den)}</td><td class="n">${fP(d.share)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="small muted" style="padding:0 18px">Clic su una riga per aprire l'analisi del programma fino ai piani gestionali.</p>
    </div>`;
  };

  views.settori = () => {
    const st = state.set;
    // costruzione albero da righe programma
    const rows = [...S.progs.values()].map((pr) => {
      const b = pr.base;
      const misNaz = b ? b.mis : pr.mis;
      return { pr, minL: pr.min, misMin: pr.min + "|" + pr.u1, misMinL: pr.a5 ? pr.a5.mis : pr.a7 ? pr.a7.mis : pr.a6.mis, misNaz,
        vals: [v(pr.a5, 0), v(pr.a5, 1), v(pr.a5, 2), v(pr.a7, 0), v(pr.a7, 1), v(pr.a7, 2), sum(pr.a6 ? pr.a6.v : [0])],
        base27: b ? b.t[1][1] + b.t[2][1] : 0, flex27: b ? b.f[1] : 0 };
    });
    const groups = new Map();
    const add = (path, r) => {
      let lvl = groups;
      path.forEach(([id, label], d) => {
        let g = lvl.get(id);
        if (!g) { g = { id, label, d, vals: [0, 0, 0, 0, 0, 0, 0], base27: 0, flex27: 0, kids: new Map(), pr: null }; lvl.set(id, g); }
        r.vals.forEach((x, i) => (g.vals[i] += x));
        g.base27 += r.base27; g.flex27 += r.flex27;
        if (d === path.length - 1) g.pr = r.pr;
        lvl = g.kids;
      });
    };
    for (const r of rows) {
      const prog = [r.pr.key, r.pr.cod + " " + r.pr.prg];
      if (st.mode === "ministero") add([["m:" + r.minL, cap(r.minL)], ["mm:" + r.misMin, r.pr.u1 + " " + cap(r.misMinL)], prog], r);
      else add([["n:" + r.misNaz, cap(r.misNaz.replace(/^0+/, ""))], ["nm:" + r.misNaz + r.minL, cap(r.minL)], prog], r);
    }
    const sortKids = (m) => [...m.values()].sort((a, b) => (a.vals[0] + a.vals[3]) - (b.vals[0] + b.vals[3]));
    let html = "";
    const walk = (list) => list.forEach((g) => {
      const open = st.open.has(g.id), hasKids = g.kids.size > 0;
      const tot27 = g.vals[0] + g.vals[3];
      html += `<tr class="l${g.d} click" data-${hasKids ? "tog" : "go"}="${hasKids ? esc(g.id) : "programma/" + encodeURIComponent(g.id)}">
        <td>${hasKids ? `<span class="tw">${open ? "▾" : "▸"}</span>` : `<span class="tw">›</span>`}${esc(g.label)}</td>
        ${g.vals.map((x, i) => `<td class="n ${sgn(x)}">${x ? fM(x) : "-"}</td>`).join("")}
        <td class="n">${fM(g.base27)}</td><td class="n">${g.base27 ? fP(-tot27 / g.base27) : "n.d."}</td><td class="n">${g.flex27 ? fP(-tot27 / g.flex27) : "n.d."}</td></tr>`;
      if (open && hasKids) walk(sortKids(g.kids));
    });
    walk(sortKids(groups));
    return `
    <h1>Riduzioni e variazioni per settore</h1>
    <p class="lead">Articolazione degli allegati 5, 6 e 7 per Ministero, missione e programma, oppure per missione (settore di spesa trasversale ai Ministeri). Importi in milioni di euro; le riduzioni sono negative.</p>
    <div class="card flush">
      <div class="card-h bar-ctl">
        <label>Raggruppa per <span class="seg" data-act="set-mode"><button data-v="ministero" class="${st.mode === "ministero" ? "on" : ""}">Ministero</button><button data-v="missione" class="${st.mode === "missione" ? "on" : ""}">Missione (settore)</button></span></label>
        <button class="btn ghost" data-act="set-all">Espandi / comprimi tutto</button>
        <button class="btn ghost" data-act="set-csv">Esporta CSV</button>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th rowspan="2">${st.mode === "ministero" ? "Ministero / Missione / Programma" : "Missione / Ministero / Programma"}</th>
        <th class="n" colspan="3"><span class="tag a5">All. 5</span> Titolo II</th><th class="n" colspan="3"><span class="tag a7">All. 7</span> Titolo I</th><th class="n"><span class="tag a6">All. 6</span></th><th class="n" colspan="3">Peso della riduzione 2027</th></tr>
        <tr><th class="n">2027</th><th class="n">2028</th><th class="n">2029</th><th class="n">2027</th><th class="n">2028</th><th class="n">2029+</th><th class="n">2030-32</th><th class="n">LB 2026 per il 2027</th><th class="n" title="Riduzione 2027 su stanziamento Titolo I+II">% totale</th><th class="n" title="Riduzione 2027 su stanziamento escluse le categorie rigide per natura">% spesa non rigida</th></tr></thead>
        <tbody>${html}</tbody></table></div>
    </div>`;
  };

  // ---------- analisi programma con simulatore ----------
  function pgRowsFor(pr, tit) {
    const C = S.lbC, D = S.lb.dict;
    return S.lb.rows.filter((r) => D[r[C.amm]] === pr.min && r[C.udv1] === pr.u1 && r[C.udv2] === pr.u2 && r[C.tit] === tit);
  }
  const rigid = (cat) => S.meta.cat_rigide.includes(String(cat));

  views.programma = (arg) => {
    const st = state.prog;
    if (arg) { const k = decodeURIComponent(arg); if (k !== st.key) { st.key = k; st.cuts = null; st.inc = null; const pr0 = S.progs.get(k); if (pr0) st.tit = pr0.a5 ? 2 : 1; } }
    const list = [...S.progs.values()].sort((a, b) => (a.min + a.u1 * 100 + a.u2).localeCompare(b.min + b.u1 * 100 + b.u2));
    if (!st.key || !S.progs.get(st.key)) st.key = list.slice().sort((a, b) => (v(a.a5, 0) + v(a.a7, 0)) - (v(b.a5, 0) + v(b.a7, 0)))[0].key;
    const pr = S.progs.get(st.key);
    const years = ["2027", "2028"], yi = st.yi, lbi = yi + 1;
    const all = st.tit === 2 ? pr.a5 : pr.a7;
    const target = all ? -(all.v[yi] - (st.net ? all.p[yi] : 0)) : 0;
    const rows = pgRowsFor(pr, st.tit);
    const C = S.lbC, D = S.lb.dict;
    const amt = (r) => r[C["cp" + (lbi + 1)]];
    const pgs = rows.map((r, i) => ({ i, r, a: amt(r), rig: rigid(r[C.cat]) })).filter((x) => x.a !== 0).sort((a, b) => b.a - a.a);
    if (!st.inc || st.inc.length !== pgs.length) { st.inc = pgs.map((x) => !x.rig); st.cuts = null; }
    if (!st.cuts) st.cuts = prorata(pgs, st.inc, target);
    const assigned = sum(st.cuts), base = sum(pgs.map((x) => x.a)), baseInc = sum(pgs.filter((x, i) => st.inc[i]).map((x) => x.a));
    const residuo = target - assigned;
    const opts = list.map((x) => `<option value="${esc(x.key)}" ${x.key === pr.key ? "selected" : ""}>${esc(minShort(x.min))} · ${esc(x.cod)} ${esc(x.prg.slice(0, 80))}</option>`).join("");

    const card = (a, lab, cls, yrs) => !a ? `<div class="card kpi ${cls}"><div class="l">${lab}</div><div class="v muted">-</div><div class="s">Programma non presente</div></div>` :
      `<div class="card kpi ${cls}"><div class="l">${lab}</div><div class="v">${fMl(sum(a.v))}</div><div class="s">${a.v.map((x, i) => `${yrs[i]}: ${fM(x)}`).join(" · ")} mln<br>di cui per legge: ${a.p.map((x) => fM(x)).join(" · ")}</div></div>`;
    const b = pr.base;
    const baseTbl = b ? `<table><thead><tr><th>LB 2026 competenza (mln)</th><th class="n">2026</th><th class="n">2027</th><th class="n">2028</th></tr></thead><tbody>
      <tr><td>Titolo I, spese correnti</td>${b.t[1].map((x) => `<td class="n">${fM(x)}</td>`).join("")}</tr>
      <tr><td>Titolo II, conto capitale</td>${b.t[2].map((x) => `<td class="n">${fM(x)}</td>`).join("")}</tr>
      <tr><td>Riduzione su Titolo II (all. 5)</td><td class="n">-</td><td class="n">${pr.a5 ? fP(-pr.a5.v[0] / b.t[2][1]) : "-"}</td><td class="n">${pr.a5 ? fP(-pr.a5.v[1] / b.t[2][2]) : "-"}</td></tr>
      <tr><td>Riduzione su Titolo I (all. 7)</td><td class="n">-</td><td class="n">${pr.a7 ? fP(-pr.a7.v[0] / b.t[1][1]) : "-"}</td><td class="n">${pr.a7 ? fP(-pr.a7.v[1] / b.t[1][2]) : "-"}</td></tr>
      </tbody></table>` : `<p class="muted">Programma non trovato nella LB 2026 (possibile nuova articolazione).</p>`;

    const trs = pgs.map((x, i) => {
      const r = x.r, c = st.cuts[i] || 0, nu = x.a - c;
      return `<tr>
        <td><input type="checkbox" data-act="sim-inc" data-i="${i}" ${st.inc[i] ? "checked" : ""}></td>
        <td class="n">${r[C.cap]}/${r[C.pg]}</td>
        <td><div>${esc(cap(D[r[C.pgd]]))}</div>${D[r[C.capd]] !== D[r[C.pgd]] ? `<div class="small muted">Cap.: ${esc(cap(D[r[C.capd]]).slice(0, 140))}</div>` : ""}<div class="small muted">${esc(D[r[C.az]])} · ${esc(cap(D[r[C.cdr]]))}</div></td>
        <td><span class="small">${esc(cap(S.meta.categorie[r[C.cat]] || r[C.cat]))}</span> ${x.rig ? `<span class="tag rig" title="Categoria considerata rigida per natura">rigida</span>` : ""}</td>
        <td class="n">${fE(x.a)}</td>
        <td class="n"><input type="number" step="1000" data-act="sim-cut" data-i="${i}" value="${Math.round(c)}"></td>
        <td class="n">${fE(nu)}</td>
        <td class="n ${c > 0 ? "neg" : ""}">${x.a ? fP(-c / x.a) : "-"}</td></tr>`;
    }).join("");

    return `
    <h1>Analisi del programma</h1>
    <p class="lead">Impatto delle riduzioni sul programma e simulazione della loro ripartizione sui piani gestionali, a partire dagli stanziamenti della LB 2026 per lo stesso anno. Utile per valutare la sostenibilità del taglio e le eventuali rimodulazioni tra programmi consentite dall'art. 135 (decreto MEF su proposta dei Ministri).</p>
    <div class="card bar-ctl"><label style="flex:1">Programma <select data-act="prog-sel" style="width:100%">${opts}</select></label></div>
    <h2>${esc(cap(pr.min))}</h2>
    <p class="muted" style="margin-top:-6px">Missione ${esc(cap(pr.mis.replace(/^0+/, "")))} · Programma ${esc(pr.cod)} ${esc(pr.prg)}</p>
    <div class="grid g3">
      ${card(pr.a5, "All. 5 · riduzioni Titolo II", "cut", ["2027", "2028", "2029"])}
      ${card(pr.a7, "All. 7 · riduzioni Titolo I", "t1", ["2027", "2028", "2029+"])}
      ${card(pr.a6, "All. 6 · incrementi Titolo II", "inc", ["2030", "2031", "2032"])}
    </div>
    <div class="card"><div class="tbl-wrap">${baseTbl}</div></div>
    <div class="card flush">
      <div class="card-h">
        <h2>Simulatore di ripartizione sui piani gestionali</h2>
        <div class="bar-ctl">
          <label>Titolo <span class="seg" data-act="sim-tit"><button data-v="2" class="${st.tit === 2 ? "on" : ""}">II (all. 5)</button><button data-v="1" class="${st.tit === 1 ? "on" : ""}">I (all. 7)</button></span></label>
          <label>Anno <span class="seg" data-act="sim-year">${years.map((y, i) => `<button data-v="${i}" class="${i === yi ? "on" : ""}">${y}</button>`).join("")}</span></label>
          <label><input type="checkbox" data-act="sim-net" ${st.net ? "checked" : ""}> Escludi la quota predeterminata per legge</label>
          <button class="btn" data-act="sim-pro">Ripartisci pro quota sui PG selezionati</button>
          <button class="btn ghost" data-act="sim-zero">Azzera</button>
          <button class="btn ghost" data-act="sim-csv">Esporta CSV</button>
        </div>
        <div class="sim-sum">
          <span>Riduzione da ripartire: <b class="neg">${fE(target)}</b></span>
          <span>Assegnata: <b>${fE(assigned)}</b></span>
          <span>Residuo: <b class="${Math.abs(residuo) > 1 ? "neg" : "pos"}">${fE(residuo)}</b></span>
          <span>Stanziamento LB ${years[yi]} del titolo: <b>${fE(base)}</b> (${fP(target / base)})</span>
          <span>PG selezionati: <b>${fE(baseInc)}</b> (${fP(target / baseInc)})</span>
        </div>
        ${!all ? `<div class="callout warn">Il programma non ha riduzioni sul Titolo ${st.tit === 2 ? "II" : "I"}: si può comunque usare la tabella per vedere la composizione per piano gestionale.</div>` : ""}
        ${target > baseInc && all ? `<div class="callout warn">La riduzione supera lo stanziamento dei PG selezionati: includere altri piani gestionali o valutare una rimodulazione verso altri programmi.</div>` : ""}
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th title="Includi nel riparto">Incl.</th><th class="n">Cap./PG</th><th>Piano gestionale</th><th>Categoria economica</th><th class="n">LB ${years[yi]}</th><th class="n">Riduzione simulata</th><th class="n">Nuovo stanziamento</th><th class="n">Var. %</th></tr></thead>
        <tbody>${trs || `<tr><td colspan="8" class="muted">Nessun piano gestionale con stanziamento per questo titolo e anno.</td></tr>`}</tbody>
      </table></div>
      <p class="small muted" style="padding:0 18px">Pre-selezione: sono esclusi i PG di categorie economiche rigide per natura (redditi da lavoro, imposte sulla produzione, risorse UE, interessi, rimborsi, rimborso passività). È un'euristica: la rimodulabilità effettiva dipende dalla natura della spesa (oneri inderogabili, fattore legislativo, fabbisogno) da verificare sul capitolo.</p>
    </div>`;
  };

  function prorata(pgs, inc, target) {
    const tot = sum(pgs.map((x, i) => (inc[i] ? x.a : 0)));
    if (!tot || !target) return pgs.map(() => 0);
    let out = pgs.map((x, i) => (inc[i] ? Math.round((target * x.a) / tot) : 0));
    const diff = target - sum(out); // arrotondamenti sul PG maggiore incluso
    const k = inc.findIndex((b) => b); if (k >= 0) out[k] += diff;
    return out;
  }

  // ---------- esplora piani gestionali ----------
  function pgFiltered() {
    const st = state.pg, C = S.lbC, D = S.lb.dict;
    const q = st.q.trim().toLowerCase();
    let rows = S.lb.rows.filter((r) =>
      (!st.amm || D[r[C.amm]] === st.amm) && (!st.tit || r[C.tit] === +st.tit) && (!st.cat || r[C.cat] === +st.cat) &&
      (!st.only || S.progs.has(D[r[C.amm]] + "|" + r[C.udv1] + "|" + r[C.udv2])) &&
      (!q || (D[r[C.pgd]] + " " + D[r[C.capd]] + " " + D[r[C.prg]] + " " + D[r[C.az]] + " " + r[C.cap]).toLowerCase().includes(q)));
    const key = { cp2: (r) => -r[C.cp2], dneg: (r) => r[C.cp3] - r[C.cp1], dpos: (r) => -(r[C.cp3] - r[C.cp1]) }[st.sort];
    return rows.sort((a, b) => key(a) - key(b));
  }
  views.pg = () => {
    const st = state.pg, C = S.lbC, D = S.lb.dict;
    const rows = pgFiltered(), per = 100, pages = Math.max(1, Math.ceil(rows.length / per));
    if (st.page >= pages) st.page = 0;
    const pageRows = rows.slice(st.page * per, st.page * per + per);
    const tot = [C.cp1, C.cp2, C.cp3].map((c) => sum(rows.map((r) => r[c])));
    const amms = [...new Set(S.lb.rows.map((r) => D[r[C.amm]]))].sort();
    const cats = Object.entries(S.meta.categorie).sort((a, b) => +a[0] - +b[0]);
    return `
    <h1>Piani gestionali</h1>
    <p class="lead">Tutti i ${fE(S.lb.rows.length)} piani gestionali di spesa della Legge di bilancio 2026-2028 (BDAP). L'andamento 2026-2028 a legislazione vigente mostra dove le risorse sono già in calo prima della manovra: ordinare per "calo 2026-2028" per individuare i definanziamenti già scritti in bilancio.</p>
    <div class="card bar-ctl">
      <input type="search" placeholder="Cerca capitolo, PG, azione, programma..." value="${esc(st.q)}" data-act="pg-q">
      <select data-act="pg-amm"><option value="">Tutte le amministrazioni</option>${amms.map((a) => `<option ${a === st.amm ? "selected" : ""} value="${esc(a)}">${esc(minShort(a))}</option>`).join("")}</select>
      <select data-act="pg-tit"><option value="">Tutti i titoli</option>${[1, 2, 3].map((t) => `<option ${String(t) === String(st.tit) ? "selected" : ""} value="${t}">Titolo ${["I", "II", "III"][t - 1]}</option>`).join("")}</select>
      <select data-act="pg-cat"><option value="">Tutte le categorie</option>${cats.map(([k, d]) => `<option ${k === String(st.cat) ? "selected" : ""} value="${k}">${k} ${esc(cap(d))}</option>`).join("")}</select>
      <select data-act="pg-sort"><option value="cp2" ${st.sort === "cp2" ? "selected" : ""}>Ordina per stanziamento 2027</option><option value="dneg" ${st.sort === "dneg" ? "selected" : ""}>Ordina per calo 2026-2028</option><option value="dpos" ${st.sort === "dpos" ? "selected" : ""}>Ordina per aumento 2026-2028</option></select>
      <label><input type="checkbox" data-act="pg-only" ${st.only ? "checked" : ""}> Solo programmi colpiti dagli allegati</label>
      <button class="btn ghost" data-act="pg-csv">Esporta CSV</button>
    </div>
    <div class="card flush">
      <div class="pager">${fE(rows.length)} PG · totale 2026 ${fMl(tot[0])} · 2027 ${fMl(tot[1])} · 2028 ${fMl(tot[2])}
        <span style="margin-left:auto"></span>
        <button class="btn ghost" data-act="pg-page" data-v="-1" ${st.page === 0 ? "disabled" : ""}>‹</button> pag. ${st.page + 1} / ${pages} <button class="btn ghost" data-act="pg-page" data-v="1" ${st.page >= pages - 1 ? "disabled" : ""}>›</button></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Amministrazione / Programma</th><th class="n">Cap./PG</th><th>Piano gestionale</th><th>Cat.</th><th class="n">2026</th><th class="n">2027</th><th class="n">2028</th><th class="n">Var. 2028/2026</th></tr></thead>
        <tbody>${pageRows.map((r) => {
          const d = r[C.cp3] - r[C.cp1], k = D[r[C.amm]] + "|" + r[C.udv1] + "|" + r[C.udv2], hit = S.progs.has(k);
          return `<tr><td><div>${esc(minShort(D[r[C.amm]]))}</div><div class="small muted">${hit ? `<a href="#programma/${encodeURIComponent(k)}">${esc(D[r[C.prg]])}</a>` : esc(D[r[C.prg]])}</div></td>
          <td class="n">${r[C.cap]}/${r[C.pg]}</td><td><div>${esc(cap(D[r[C.pgd]]).slice(0, 220))}</div>${D[r[C.capd]] !== D[r[C.pgd]] ? `<div class="small muted">${esc(cap(D[r[C.capd]]).slice(0, 120))}</div>` : ""}</td>
          <td class="small">${r[C.cat]} ${rigid(r[C.cat]) ? `<span class="tag rig">rigida</span>` : ""}</td>
          <td class="n">${fE(r[C.cp1])}</td><td class="n">${fE(r[C.cp2])}</td><td class="n">${fE(r[C.cp3])}</td>
          <td class="n ${sgn(d)}">${r[C.cp1] ? fP(d / r[C.cp1]) : d ? "nuovo" : "-"}</td></tr>`;
        }).join("")}</tbody></table></div>
    </div>`;
  };

  // ---------- variazioni DLB per PG ----------
  views.variazioni = () => {
    const a4 = `<div class="card flush"><div class="card-h"><h2>Allegato 4 (art. 86, c. 4): autorizzazioni di spesa mantenute in bilancio, MIMIT</h2>
      <p class="small muted">Unico allegato del testo del DDL con dettaglio per capitolo e piano gestionale (riforma del Codice degli incentivi).</p></div>
      <div class="tbl-wrap"><table><thead><tr><th class="n">Cap./PG</th><th>Piano gestionale</th><th>Autorizzazione</th>${["2027", "2028", "2029", "2030", "2031"].map((y) => `<th class="n">${y}</th>`).join("")}</tr></thead>
      <tbody>${S.a4.map((r) => `<tr><td class="n">${r.capitolo}/${r.piano_gestionale}</td><td>${esc(cap(r.denominazione_pg))}<div class="small muted">${esc(cap(r.denominazione_capitolo))}</div></td><td class="small">${esc(r.autorizzazione)}</td>${["2027", "2028", "2029", "2030", "2031"].map((y) => `<td class="n">${r[y] ? fE(+r[y]) : "-"}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
    if (!S.dlb) {
      return `<h1>Variazioni del DLB per piano gestionale</h1>
      <div class="callout warn"><b>Dati del DLB 2027-2029 per piano gestionale non ancora disponibili.</b><br>
      Il testo del DDL (Sezione I) espone le riduzioni solo per Ministero, missione e programma. Il dettaglio per capitolo e piano gestionale, con la scomposizione tra legislazione vigente, rimodulazioni e rifinanziamenti/definanziamenti (Sezione II) ed effetti della Sezione I, è pubblicato da RGS su BDAP Open Data come dataset
      <i>"2027 - Disegno Legge di Bilancio Presentato Elaborabile Spese Piano di Gestione"</i>. Al momento dell'ultimo aggiornamento non risultava ancora pubblicato.<br><br>
      Quando sarà disponibile: <code>python scripts/fetch_bdap.py dlb 2027 &amp;&amp; python scripts/build_data.py</code>. Questa pagina mostrerà allora, per ogni PG, dove le risorse vengono spostate e riviste.</div>
      ${a4}`;
    }
    const st = state.var, ds = S.dlb, C = colIndex(ds), D = ds.dict, yrs = S.meta.dlb.anni, k = st.yi + 1;
    const g = (r, p) => r[C[p + k]] || 0;
    const q = st.q.trim().toLowerCase();
    let rows = ds.rows.filter((r) => (!st.amm || D[r[C.amm]] === st.amm) && (!q || (D[r[C.pgd]] + " " + D[r[C.capd]] + " " + D[r[C.prg]] + " " + r[C.cap]).toLowerCase().includes(q)));
    const varTot = (r) => g(r, "int") - g(r, "lv");
    const changed = rows.filter((r) => varTot(r) !== 0 || g(r, "rim") !== 0);
    changed.sort((a, b) => varTot(a) - varTot(b));
    // aggregato per amministrazione
    const agg = new Map();
    for (const r of ds.rows) {
      const a = D[r[C.amm]]; let o = agg.get(a); if (!o) agg.set(a, (o = { a, rim: 0, rif: 0, s1: 0, lv: 0 }));
      o.rim += g(r, "rim"); o.rif += g(r, "rif"); o.s1 += g(r, "s1"); o.lv += g(r, "lv");
    }
    const ag = [...agg.values()].sort((a, b) => (a.rim + a.rif + a.s1) - (b.rim + b.rif + b.s1));
    const per = 100, pages = Math.max(1, Math.ceil(changed.length / per)); if (st.page >= pages) st.page = 0;
    const amms = [...agg.keys()].sort();
    return `<h1>Variazioni del DLB per piano gestionale</h1>
    <p class="lead">Fonte: ${esc(S.meta.dlb.file)} (BDAP). Per ogni PG: legislazione vigente, rimodulazioni e rifinanziamenti/definanziamenti/riprogrammazioni (Sezione II), effetti della Sezione I e DLB integrato. Competenza ${yrs[st.yi]}.</p>
    <div class="card bar-ctl">
      <label>Anno <span class="seg" data-act="var-year">${yrs.map((y, i) => `<button data-v="${i}" class="${i === st.yi ? "on" : ""}">${y}</button>`).join("")}</span></label>
      <select data-act="var-amm"><option value="">Tutte le amministrazioni</option>${amms.map((a) => `<option ${a === st.amm ? "selected" : ""} value="${esc(a)}">${esc(minShort(a))}</option>`).join("")}</select>
      <input type="search" placeholder="Cerca capitolo, PG, programma..." value="${esc(st.q)}" data-act="var-q">
      <button class="btn ghost" data-act="var-csv">Esporta CSV</button>
    </div>
    <div class="card flush"><div class="card-h"><h2>Saldo delle variazioni per amministrazione (mln)</h2></div><div class="tbl-wrap"><table>
      <thead><tr><th>Amministrazione</th><th class="n">Legisl. vigente</th><th class="n">Rimodulazioni</th><th class="n">Rif./Def./Rip.</th><th class="n">Effetti Sez. I</th><th class="n">Var. totale %</th></tr></thead>
      <tbody>${ag.map((o) => `<tr class="click" data-act="var-pick" data-v="${esc(o.a)}"><td>${esc(minShort(o.a))}</td><td class="n">${fM(o.lv)}</td><td class="n ${sgn(o.rim)}">${fM(o.rim)}</td><td class="n ${sgn(o.rif)}">${fM(o.rif)}</td><td class="n ${sgn(o.s1)}">${fM(o.s1)}</td><td class="n ${sgn(o.rim + o.rif + o.s1)}">${o.lv ? fP((o.rim + o.rif + o.s1) / o.lv) : "-"}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="card flush">
      <div class="pager">${fE(changed.length)} PG con variazioni, ordinati dalla riduzione maggiore<span style="margin-left:auto"></span>
        <button class="btn ghost" data-act="var-page" data-v="-1" ${st.page === 0 ? "disabled" : ""}>‹</button> pag. ${st.page + 1} / ${pages} <button class="btn ghost" data-act="var-page" data-v="1" ${st.page >= pages - 1 ? "disabled" : ""}>›</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Amministrazione / Programma</th><th class="n">Cap./PG</th><th>Piano gestionale</th><th class="n">Legisl. vigente</th><th class="n">Rimodul.</th><th class="n">Rif./Def.</th><th class="n">Sez. I</th><th class="n">DLB integrato</th><th class="n">Var. %</th></tr></thead>
      <tbody>${changed.slice(st.page * per, st.page * per + per).map((r) => {
        const d = varTot(r);
        return `<tr><td><div>${esc(minShort(D[r[C.amm]]))}</div><div class="small muted">${esc(D[r[C.prg]])}</div></td><td class="n">${r[C.cap]}/${r[C.pg]}</td>
        <td>${esc(cap(D[r[C.pgd]]))}<div class="small muted">${esc(cap(D[r[C.capd]]).slice(0, 110))}</div></td>
        <td class="n">${fE(g(r, "lv"))}</td><td class="n ${sgn(g(r, "rim"))}">${fE(g(r, "rim"))}</td><td class="n ${sgn(g(r, "rif"))}">${fE(g(r, "rif"))}</td><td class="n ${sgn(g(r, "s1"))}">${fE(g(r, "s1"))}</td><td class="n">${fE(g(r, "int"))}</td>
        <td class="n ${sgn(d)}">${g(r, "lv") ? fP(d / g(r, "lv")) : "nuovo"}</td></tr>`;
      }).join("")}</tbody></table></div></div>
    ${a4}`;
  };

  // ---------- articolato ----------
  views.articolato = () => {
    const st = state.art, q = st.q.trim().toLowerCase();
    const tits = [...new Set(S.art.map((a) => a.titolo))];
    const list = S.art.filter((a) => (!st.tit || a.titolo === st.tit) && (!q || (a.rubrica + " " + a.testo).toLowerCase().includes(q)));
    const hl = (s) => { s = esc(s); if (!q) return s; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); return s.replace(re, (m) => `<mark>${m}</mark>`); };
    let cur = "", html = "";
    for (const a of list) {
      if (a.titolo !== cur) { cur = a.titolo; html += `<h3 style="margin-top:18px;color:var(--navy)">${esc(cap(cur))}</h3>`; }
      html += `<details class="art" ${q && list.length < 6 ? "open" : ""}><summary>Art. ${a.n} · ${hl(a.rubrica)} <span class="muted small">${a.capo ? "· " + esc(cap(a.capo)) : ""}${a.n_importi ? ` · ${a.n_importi} importi citati in milioni` : ""}</span></summary><div class="txt">${hl(a.testo)}</div></details>`;
    }
    return `<h1>Articolato (Sezione I)</h1>
    <p class="lead">${S.art.length} articoli del DDL. La ricerca filtra rubrica e testo: utile per risalire alle norme che finanziano o definanziano un settore (ad es. "autorizzazione di spesa", "è ridotto", "fondo").</p>
    <div class="card bar-ctl"><input type="search" placeholder="Cerca nel testo..." value="${esc(st.q)}" data-act="art-q">
      <select data-act="art-tit"><option value="">Tutti i titoli</option>${tits.map((t) => `<option ${t === st.tit ? "selected" : ""} value="${esc(t)}">${esc(cap(t)).slice(0, 90)}</option>`).join("")}</select>
      <span class="muted small">${list.length} articoli</span></div>
    <div class="card">${html || '<p class="muted">Nessun articolo trovato.</p>'}</div>`;
  };

  views.note = () => `<h1>Note metodologiche e fonti</h1>
    <div class="card"><h2>Fonti</h2><ul>
      <li><b>Testo del DDL di bilancio 2027-2029</b> (Sezione I, PDF nel repository): articolato e allegati 4, 5, 6 e 7. Gli allegati sono immagini: le cifre sono estratte con OCR (tesseract) e verificate controllando che i programmi sommino alla missione, le missioni al Ministero e i Ministeri al totale di ciascun allegato. Le poche correzioni manuali sono elencate in <code>scripts/parse_allegati.py</code> con la pagina di riferimento.</li>
      <li><b>${esc(S.meta.fonte_lb)}</b>: stanziamenti di competenza 2026, 2027 e 2028 per capitolo e piano gestionale, usati come termine di confronto (stessa unità di voto: Ministero, missione, programma).</li>
      <li><b>DLB 2027-2029 per piano gestionale</b> (BDAP): ${S.dlb ? "caricato." : "non ancora pubblicato; la pagina \"Variazioni DLB per PG\" si attiva automaticamente quando il dataset viene scaricato."}</li>
    </ul></div>
    <div class="card"><h2>Limiti da tenere presenti</h2><ul>
      <li>Il confronto con la LB 2026 non è il tendenziale del DLB 2027: tra le due leggi intervengono assestamento, decreti e variazioni. È una base di riferimento ragionevole per il 2027 e il 2028, non per il 2029 (fuori dal triennio).</li>
      <li>Le riduzioni dell'art. 135 sono definite per programma; la loro distribuzione per capitolo e PG è già nella Sezione II del DLB, che non è nel PDF caricato. Il simulatore serve a valutare sostenibilità e alternative, non riproduce la ripartizione effettiva.</li>
      <li>La "rigidità" per categoria economica è un'euristica. La classificazione corretta (oneri inderogabili, fattore legislativo, adeguamento al fabbisogno) è per capitolo e non è presente nei dataset open usati.</li>
      <li>Ministero della Difesa e altre amministrazioni non compaiono negli allegati 5-7: non hanno riduzioni a titolo dell'art. 135.</li>
      <li>Gli importi "in milioni" nell'articolato sono un conteggio delle cifre citate nel testo, non la quantificazione degli effetti (che è nella Relazione tecnica).</li>
    </ul></div>
    <div class="card"><h2>Aggiornare i dati</h2><pre class="small">python scripts/fetch_bdap.py lb 2026
python scripts/fetch_bdap.py dlb 2027      # quando pubblicato
python scripts/parse_allegati.py &lt;cartella_ocr&gt;
python scripts/build_data.py</pre></div>`;

  // ---------- CSV ----------
  function downloadCSV(name, header, rows) {
    const q = (x) => { const s = String(x ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = "﻿" + [header, ...rows].map((r) => r.map(q).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- routing e eventi ----------
  let current = "panoramica";
  function render() {
    const h = location.hash.replace(/^#/, "") || "panoramica";
    const [view, ...rest] = h.split("/");
    current = views[view] ? view : "panoramica";
    document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + current));
    const y = scrollY;
    $("#app").innerHTML = views[current](rest.join("/"));
    return y;
  }
  const rerender = () => { const y = scrollY; render(); scrollTo(0, y); };
  addEventListener("hashchange", () => { render(); scrollTo(0, 0); });

  document.addEventListener("click", (e) => {
    const t = e.target;
    const go = t.closest("[data-go]");
    if (go && !t.closest("a,input,button")) { location.hash = go.getAttribute("data-go"); return; }
    const tog = t.closest("[data-tog]");
    if (tog) { const id = tog.getAttribute("data-tog"); state.set.open.has(id) ? state.set.open.delete(id) : state.set.open.add(id); rerender(); return; }
    const segBtn = t.closest(".seg button");
    const act = (segBtn ? segBtn.parentElement : t.closest("[data-act]"))?.getAttribute("data-act");
    if (!act) return;
    const val = segBtn ? segBtn.getAttribute("data-v") : t.closest("[data-act]").getAttribute("data-v");
    const P = state.prog;
    switch (act) {
      case "pano-year": state.pano.year = +val; break;
      case "set-mode": state.set.mode = val; state.set.open.clear(); break;
      case "set-all": {
        if (state.set.open.size) state.set.open.clear();
        else { const pre = state.set.mode === "ministero" ? ["m:", "mm:"] : ["n:", "nm:"]; for (const pr of S.progs.values()) { const b = pr.base; if (state.set.mode === "ministero") { state.set.open.add("m:" + pr.min); state.set.open.add("mm:" + pr.min + "|" + pr.u1); } else { const mn = b ? b.mis : pr.mis; state.set.open.add("n:" + mn); state.set.open.add("nm:" + mn + pr.min); } } void pre; }
        break;
      }
      case "set-csv": {
        const rows = [...S.progs.values()].map((pr) => [cap(pr.min), pr.base ? pr.base.mis : pr.mis, pr.cod, pr.prg, v(pr.a5, 0), v(pr.a5, 1), v(pr.a5, 2), p(pr.a5, 0), p(pr.a5, 1), p(pr.a5, 2), v(pr.a7, 0), v(pr.a7, 1), v(pr.a7, 2), p(pr.a7, 0), p(pr.a7, 1), p(pr.a7, 2), v(pr.a6, 0), v(pr.a6, 1), v(pr.a6, 2), pr.base ? pr.base.t[1][1] : "", pr.base ? pr.base.t[2][1] : ""]);
        downloadCSV("riduzioni_art135_per_programma.csv", ["Ministero", "Missione", "Codice", "Programma", "All5 2027", "All5 2028", "All5 2029", "All5 pred 2027", "All5 pred 2028", "All5 pred 2029", "All7 2027", "All7 2028", "All7 2029+", "All7 pred 2027", "All7 pred 2028", "All7 pred 2029+", "All6 2030", "All6 2031", "All6 2032", "LB2026 Tit I 2027", "LB2026 Tit II 2027"], rows);
        return;
      }
      case "sim-tit": P.tit = +val; P.cuts = null; P.inc = null; break;
      case "sim-year": P.yi = +val; P.cuts = null; P.inc = null; break;
      case "sim-pro": P.cuts = null; break;
      case "sim-zero": P.cuts = P.cuts.map(() => 0); break;
      case "sim-csv": {
        const pr = S.progs.get(P.key), C = S.lbC, D = S.lb.dict, lbi = P.yi + 1;
        const pgs = pgRowsFor(pr, P.tit).map((r) => ({ r, a: r[C["cp" + (lbi + 1)]] })).filter((x) => x.a !== 0).sort((a, b) => b.a - a.a);
        downloadCSV(`simulazione_${pr.min.slice(0, 20)}_${pr.cod}_${2027 + P.yi}.csv`.replace(/[^\w.]+/g, "_"), ["Capitolo", "PG", "Piano gestionale", "Categoria", "Incluso", "LB", "Riduzione simulata", "Nuovo stanziamento"],
          pgs.map((x, i) => [x.r[C.cap], x.r[C.pg], D[x.r[C.pgd]], x.r[C.cat], P.inc[i] ? "si" : "no", x.a, P.cuts[i], x.a - P.cuts[i]]));
        return;
      }
      case "pg-page": state.pg.page += +val; break;
      case "pg-csv": {
        const C = S.lbC, D = S.lb.dict;
        downloadCSV("piani_gestionali_lb2026.csv", ["Amministrazione", "Missione", "Programma", "Azione", "CdR", "Capitolo", "Denominazione capitolo", "PG", "Piano gestionale", "Titolo", "Categoria", "CP 2026", "CP 2027", "CP 2028"],
          pgFiltered().map((r) => [D[r[C.amm]], D[r[C.mis]], D[r[C.prg]], D[r[C.az]], D[r[C.cdr]], r[C.cap], D[r[C.capd]], r[C.pg], D[r[C.pgd]], r[C.tit], r[C.cat], r[C.cp1], r[C.cp2], r[C.cp3]]));
        return;
      }
      case "var-year": state.var.yi = +val; break;
      case "var-page": state.var.page += +val; break;
      case "var-pick": state.var.amm = val; state.var.page = 0; break;
      case "var-csv": {
        const ds = S.dlb, C = colIndex(ds), D = ds.dict;
        downloadCSV("dlb_variazioni_pg.csv", ["Amministrazione", "Programma", "Capitolo", "PG", "Piano gestionale", ...ds.cols.slice(13)],
          ds.rows.map((r) => [D[r[C.amm]], D[r[C.prg]], r[C.cap], r[C.pg], D[r[C.pgd]], ...r.slice(13)]));
        return;
      }
      default: return;
    }
    rerender();
  });

  document.addEventListener("change", (e) => {
    const t = e.target, act = t.getAttribute("data-act"); if (!act) return;
    const P = state.prog;
    switch (act) {
      case "prog-sel": location.hash = "programma/" + encodeURIComponent(t.value); return;
      case "sim-net": P.net = t.checked; P.cuts = null; break;
      case "sim-inc": P.inc[+t.getAttribute("data-i")] = t.checked; P.cuts = null; break;
      case "sim-cut": P.cuts[+t.getAttribute("data-i")] = +t.value || 0; break;
      case "pg-amm": state.pg.amm = t.value; state.pg.page = 0; break;
      case "pg-tit": state.pg.tit = t.value; state.pg.page = 0; break;
      case "pg-cat": state.pg.cat = t.value; state.pg.page = 0; break;
      case "pg-sort": state.pg.sort = t.value; state.pg.page = 0; break;
      case "pg-only": state.pg.only = t.checked; state.pg.page = 0; break;
      case "var-amm": state.var.amm = t.value; state.var.page = 0; break;
      case "art-tit": state.art.tit = t.value; break;
      default: return;
    }
    rerender();
  });

  let deb;
  document.addEventListener("input", (e) => {
    const t = e.target, act = t.getAttribute("data-act");
    const map = { "pg-q": () => { state.pg.q = t.value; state.pg.page = 0; }, "var-q": () => { state.var.q = t.value; state.var.page = 0; }, "art-q": () => { state.art.q = t.value; } };
    if (!map[act]) return;
    map[act]();
    clearTimeout(deb);
    deb = setTimeout(() => { const pos = t.selectionStart; rerender(); const n = $(`[data-act="${act}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250);
  });

  load().then(render).catch((err) => { $("#app").innerHTML = `<div class="callout warn">Errore nel caricamento dei dati: ${esc(err.message)}. Se il file è aperto da disco, servire la cartella <code>docs/</code> con un web server (es. <code>python -m http.server</code>).</div>`; });
})();
