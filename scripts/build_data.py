"""Costruisce i file JSON letti dalla dashboard (docs/data/).

Input:
  data/allegati/allegati_art135.csv   (scripts/parse_allegati.py)
  data/allegati/allegato4_art86.csv   (trascrizione manuale)
  data/bdap/lb_2026_pg.csv            (scripts/fetch_bdap.py lb 2026)
  data/bdap/dlb_2027_pg.csv           (opzionale: scripts/fetch_bdap.py dlb 2027, quando pubblicato)
  data/ddl_testo.txt                  (pdftotext -layout del testo del DDL)

Uso: python scripts/build_data.py [--dlb data/bdap/dlb_2027_pg.csv]
"""
import csv
import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data"

# Categorie economiche considerate "rigide" per natura (euristica, non e' la
# classificazione ufficiale oneri inderogabili / fattore legislativo / fabbisogno)
CAT_RIGIDE = {"1", "3", "8", "9", "10", "61"}

LB_COLS = {  # LB 2026 pubblicata: competenza 2026, 2027, 2028 e cassa 2026
    "cp1": "Cclegge_di_bilanc52363134", "cp2": "Cclegge_di_bilanc52363135",
    "cp3": "Cclegge_di_bilanc52363136", "cs1": "Cclegge_di_bilanc52452507",
}
F = {
    "amm": "Ccamministrazio1019280545", "udv1": "Ccunit__di_voto1300258506", "udv2": "Ccunit__di_voto1103745001",
    "cap": "Ccnumero_capito1938428890", "capd": "Cccapitolo_di_s1132587997",
    "pg": "Ccnumero_piano_d657606624", "pgd": "Ccpiano_di_gesti148234269",
    "tit": "Cccodice_titolo_110771548", "cat": "Cccodice_categor773880938", "catd": "Cccategoria_709124048",
    "mis": "Cccodice_mission262516158", "misd": "Ccmissione_243834300",
    "prg": "Cccodice_progra1760741809", "prgd": "Ccprogramma_1051220501",
    "cdr": "Cccentro_respons377624835", "az": "Cccodice_azione_417810113", "azd": "Ccazione_561486649",
}


class Dict:
    """Dizionario di stringhe per ridurre la dimensione del JSON."""
    def __init__(self):
        self.items, self.idx = [], {}

    def __call__(self, s):
        if s not in self.idx:
            self.idx[s] = len(self.items)
            self.items.append(s)
        return self.idx[s]


def num(x):
    try:
        return round(float(x))
    except (TypeError, ValueError):
        return 0


def title_case(s):
    return s[:1].upper() + s[1:].lower() if s.isupper() else s


def load_pg(path, cols, dlb=False):
    D = Dict()
    rows = []
    path = Path(path)
    if not path.exists() and Path(str(path) + ".gz").exists():
        path = Path(str(path) + ".gz")
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as f:
        rd = csv.DictReader(f)
        if dlb:
            cols = dlb_columns(rd.fieldnames)
        for r in rd:
            vals = {k: num(r[c]) for k, c in cols.items()}
            if not any(vals.values()):
                continue
            rows.append([
                D(r[F["amm"]]), int(r[F["udv1"]]), int(r[F["udv2"]]),
                D(r[F["mis"]] + " " + r[F["misd"]]), D(r[F["prg"]] + " " + r[F["prgd"]]),
                D(r[F["cdr"]]), D(r[F["az"]] + " " + r[F["azd"]]),
                int(r[F["cap"]]), D(r[F["capd"]]), int(r[F["pg"]]), D(r[F["pgd"]]),
                int(r[F["tit"]]), int(r[F["cat"]]),
                *[vals[k] for k in cols],
            ])
            CATS[r[F["cat"]]] = r[F["catd"]]
    return {"dict": D.items, "cols": ["amm", "udv1", "udv2", "mis", "prg", "cdr", "az", "cap", "capd", "pg", "pgd", "tit", "cat"] + list(cols), "rows": rows}


def dlb_columns(names):
    """Mappa posizionale delle misure del dataset DLB per piano di gestione (vedi metadati BDAP)."""
    groups = [("lv", "Ccplb_legislazi"), ("rim", "Ccrimodulazioni_"), ("rif", "Ccrif__def__rip__"),
              ("s2", "Ccdlb_sezione_ii"), ("s1", "Cceffetti_fin__"), ("int", "Ccdlb_integrato_")]
    cols = {}
    for key, pref in groups:
        cs = [n for n in names if n.startswith(pref)]
        for i in range(3):  # competenza anno 1..3 (le colonne successive sono cassa e residui)
            cols[f"{key}{i+1}"] = cs[i]
    return cols


CATS = {}


def build_allegati():
    rows = list(csv.DictReader(open(ROOT / "data/allegati/allegati_art135.csv", encoding="utf-8")))
    out = []
    for r in rows:
        out.append({
            "a": r["allegato"], "liv": r["livello"], "min": r["ministero"], "cod": r["codice"],
            "mis": r["missione"], "prg": r["programma"], "cmis": r["cod_missione"], "cprg": r["cod_programma"],
            "anni": [r["anno_1"], r["anno_2"], r["anno_3"]],
            "v": [int(r[f"importo_{i}"]) for i in (1, 2, 3)],
            "p": [int(r[f"predeterminato_{i}"]) for i in (1, 2, 3)],
        })
    a4 = list(csv.DictReader(open(ROOT / "data/allegati/allegato4_art86.csv", encoding="utf-8")))
    return out, a4


def build_articoli():
    txt = (ROOT / "data/ddl_testo.txt").read_text(encoding="utf-8")
    txt = txt.split("Allegati alla sezione I")[0]
    lines = [l for l in txt.splitlines() if not re.fullmatch(r"\s*\d{1,3}\s*", l)]
    arts, titolo, capo, cur = [], "", "", None
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if re.fullmatch(r"(TITOLO|CAPO) [IVXL]+", s):
            head, j = [], i + 1
            while j < len(lines) and lines[j].strip() and not lines[j].strip().startswith(("ART.", "CAPO")):
                head.append(lines[j].strip())
                j += 1
            label = s + " - " + " ".join(head)
            if s.startswith("TITOLO"):
                titolo, capo = label, ""
            else:
                capo = label
            i = j
            continue
        m = re.fullmatch(r"ART\. (\d+)\.", s)
        if m:
            # rubrica tra parentesi, anche su piu' righe
            rub = ""
            j = i + 1
            while j < len(lines):
                rub += " " + lines[j].strip()
                j += 1
                if rub.strip().endswith(")"):
                    break
            cur = {"n": int(m.group(1)), "rubrica": rub.strip().strip("()"), "titolo": titolo, "capo": capo, "testo": ""}
            arts.append(cur)
            i = j
            continue
        if cur is not None:
            cur["testo"] += lines[i].strip() + "\n"
        i += 1
    for a in arts:
        t = re.sub(r"-\n", "", a["testo"])
        t = re.sub(r"\n(?!\d+\. )", " ", t)
        a["testo"] = re.sub(r" +", " ", t).strip()
        # importi citati (milioni di euro) per orientarsi: non e' la quantificazione della RT
        mil = [float(x.replace(".", "").replace(",", ".")) for x in re.findall(r"(\d[\d.]*(?:,\d+)?) milioni di euro", a["testo"])]
        a["mln_citati"] = round(sum(mil), 1)
        a["n_importi"] = len(mil)
    return arts


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    allegati, a4 = build_allegati()
    lb = load_pg(ROOT / "data/bdap/lb_2026_pg.csv", LB_COLS)
    meta = {
        "fonte_ddl": "Testo DDL di bilancio 2027-2029 (Sezione I), allegati 4-7",
        "fonte_lb": "BDAP Open Data - Legge di Bilancio 2026 pubblicata, spese per piano di gestione",
        "lb_anni": ["2026", "2027", "2028"],
        "categorie": CATS, "cat_rigide": sorted(CAT_RIGIDE, key=int),
        "dlb": None,
    }
    dlb_path = None
    if "--dlb" in sys.argv:
        dlb_path = Path(sys.argv[sys.argv.index("--dlb") + 1])
    elif (ROOT / "data/bdap/dlb_2027_pg.csv").exists():
        dlb_path = ROOT / "data/bdap/dlb_2027_pg.csv"
    if dlb_path:
        dlb = load_pg(dlb_path, None, dlb=True)
        y = int(re.search(r"(\d{4})", Path(dlb_path).name).group(1))
        meta["dlb"] = {"file": dlb_path.name, "anni": [str(y), str(y + 1), str(y + 2)]}
        json.dump(dlb, open(OUT / "dlb_pg.json", "w"), separators=(",", ":"), ensure_ascii=False)
    else:
        (OUT / "dlb_pg.json").unlink(missing_ok=True)
    json.dump({"allegati": allegati, "allegato4": a4, "meta": meta}, open(OUT / "allegati.json", "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(lb, open(OUT / "lb_pg.json", "w"), separators=(",", ":"), ensure_ascii=False)
    json.dump(build_articoli(), open(OUT / "articoli.json", "w"), ensure_ascii=False, separators=(",", ":"))
    for p in sorted(OUT.iterdir()):
        print(p.name, round(p.stat().st_size / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
