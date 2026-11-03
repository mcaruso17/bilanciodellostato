"""Costruisce docs/data/ddl.json, l'unico file letto dalla dashboard.

Usa solo fonti ufficiali del disegno di legge:
  data/ddl_testo.txt                 testo del DDL (pdftotext -layout Testo_DDLB_2027___2029.pdf)
  data/rt_testo.txt                  Relazione tecnica (pdftotext -layout Relazione_tecnica.pdf)
  data/allegati/allegati_art135.csv  allegati 5, 6, 7 (scripts/parse_allegati.py, validati con i totali)

Uso: python scripts/build_data.py
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data"

# Ministeri: chiave breve, denominazione negli allegati, nucleo usato per riconoscere le citazioni nel testo
MINISTERI = [
    ("mef", "MINISTERO DELL'ECONOMIA E DELLE FINANZE", "Economia e finanze", r"economia e delle finanze"),
    ("mimit", "MINISTERO DELLE IMPRESE E DEL MADE IN ITALY", "Imprese e made in Italy", r"imprese e del made in italy"),
    ("lavoro", "MINISTERO DEL LAVORO E DELLE POLITICHE SOCIALI", "Lavoro e politiche sociali", r"lavoro e delle politiche sociali"),
    ("giustizia", "MINISTERO DELLA GIUSTIZIA", "Giustizia", r"giustizia"),
    ("esteri", "MINISTERO DEGLI AFFARI ESTERI E DELLA COOPERAZIONE INTERNAZIONALE", "Affari esteri e cooperazione internazionale", r"affari esteri"),
    ("istruzione", "MINISTERO DELL'ISTRUZIONE E DEL MERITO", "Istruzione e merito", r"istruzione e del merito"),
    ("interno", "MINISTERO DELL'INTERNO", "Interno", r"interno"),
    ("ambiente", "MINISTERO DELL'AMBIENTE E DELLA SICUREZZA ENERGETICA", "Ambiente e sicurezza energetica", r"ambiente e della sicurezza energetica"),
    ("mit", "MINISTERO DELLE INFRASTRUTTURE E DEI TRASPORTI", "Infrastrutture e trasporti", r"infrastrutture e dei trasporti"),
    ("mur", "MINISTERO DELL'UNIVERSITA' E DELLA RICERCA", "Università e ricerca", r"universit[àa]'? e della ricerca"),
    ("difesa", "MINISTERO DELLA DIFESA", "Difesa", r"difesa"),
    ("masaf", "MINISTERO DELL'AGRICOLTURA, DELLA SOVRANITA' ALIMENTARE E DELLE FORESTE", "Agricoltura, sovranità alimentare e foreste", r"agricoltura, della sovranit"),
    ("cultura", "MINISTERO DELLA CULTURA", "Cultura", r"cultura"),
    ("salute", "MINISTERO DELLA SALUTE", "Salute", r"salute"),
    ("turismo", "MINISTERO DEL TURISMO", "Turismo", r"turismo"),
]
CIT = {k: re.compile(r"\bministr[oi]\s+(?:dell'|della |delle |del |degli |dei )" + core, re.I) for k, _, _, core in MINISTERI}
BY_NAME = {name: k for k, name, _, _ in MINISTERI}

# Allegato 1 (art. 1): risultati differenziali, milioni di euro, dal testo del DDL
ALLEGATO1 = {
    "anni": ["2027", "2028", "2029"],
    "competenza": {"saldo_netto": [132381, 108480, 70660], "ricorso_mercato": [425000, 424009, 415717]},
    "cassa": {"saldo_netto": [197592, 170000, 128935], "ricorso_mercato": [490212, 485528, 473992]},
}


def norm(s):
    return s.replace("’", "'").replace("`", "'")


def parse_articoli():
    txt = (ROOT / "data/ddl_testo.txt").read_text(encoding="utf-8")
    txt = txt.split("Allegati alla sezione I")[0]
    lines = [l for l in txt.splitlines() if not re.fullmatch(r"\s*\d{1,3}\s*", l)]
    arts, titolo, capo, sezione, cur = [], "", "", "I", None
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if s == "Sezione II":
            sezione = "II"
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
            rub, j = "", i + 1
            while j < len(lines):
                rub += " " + lines[j].strip()
                j += 1
                if rub.strip().endswith(")"):
                    break
            cur = {"n": int(m.group(1)), "rubrica": rub.strip().strip("()"), "titolo": titolo, "capo": capo, "sezione": sezione, "testo": ""}
            arts.append(cur)
            i = j
            continue
        if cur is not None:
            cur["testo"] += lines[i].strip() + "\n"
        i += 1
    for a in arts:
        t = re.sub(r"-\n", "", a["testo"])
        t = re.sub(r"\n(?!\d+(?:-[a-z]+)?\. )", " ", t)
        t = norm(re.sub(r" +", " ", t).strip())
        a["commi"] = [c.strip() for c in re.split(r"\n(?=\d+(?:-[a-z]+)?\. )", t) if c.strip()]
        del a["testo"]
        # commi che contengono importi in euro: riportati testualmente, senza elaborazioni
        a["importi"] = [k for k, c in enumerate(a["commi"]) if re.search(r"\d[\d.,]*\s*(?:milioni|miliardi|mila)?\s*di euro|euro\s+\d", c)]
        low = " ".join(a["commi"]).lower()
        a["ministeri"] = {k: len(rx.findall(low)) for k, rx in CIT.items() if rx.search(low)}
        m = re.match(r"Stato di previsione del Ministero (.*?)(?: e disposizioni|$)", a["rubrica"])
        if m:
            for k, name, short, core in MINISTERI:
                if re.match(r"(?:dell'|della |delle |del |degli |dei )" + core, norm(m.group(1)).lower()):
                    a["stato_previsione"] = k
    return arts


def parse_rt():
    """Relazione tecnica per articolo (articoli 1-137, stessa numerazione del DDL)."""
    txt = norm((ROOT / "data/rt_testo.txt").read_text(encoding="utf-8"))
    txt = txt.split("\n                                                        Sezione II\n")[0]
    keep = []
    for l in txt.splitlines():
        if re.fullmatch(r"\s*Pagina \d+ di \d+\s*", l) or re.fullmatch(r"\s*\d{1,3}\s*", l) or "\f" in l:
            continue
        keep.append(l.rstrip())
    txt = "\n".join(keep)
    parts = re.split(r"^\s*(?:ART\.|Art\.|Articolo)\s*(\d+)\s*(?=\()", txt, flags=re.M)
    rt = {}
    for k in range(1, len(parts) - 1, 2):
        n, body = int(parts[k]), parts[k + 1]
        body = re.sub(r"^\([^)]*(?:\n[^)]*)?\)\s*", "", body.strip())  # rubrica gia' nota
        rt[n] = blocks(body)
    return rt


NUMCELL = re.compile(r"^[-+]?\(?[\d.,]+\)?\s*%?$|^[-+]?[\d.,]+\s+[-+]?[\d.,]+")


def tabular(l):
    """Riga di tabella: piu' colonne separate da spazi, oppure colonne con numeri.
    Le righe di prosa giustificata (un solo spazio largo, solo parole) restano testo."""
    s = l.strip()
    if not s:
        return False
    cells = [c for c in re.split(r" {3,}", s) if c]
    numeric = any(NUMCELL.match(c) for c in cells)
    words = re.findall(r"[A-Za-zÀ-ù]+", s)
    if not numeric and len(cells) >= 2:
        # prosa giustificata o voce di elenco: spazi larghi ma struttura di frase
        if re.match(r"^(\d+|[a-z])\)\s", s):
            return False
        if len(words) >= 7 and re.search(r"\b(di|del|della|dei|delle|per|che|il|la|le|un|una|con|nel|nella)\b", " ".join(cells)):
            return False
    if len(cells) >= 3:
        return True
    if len(cells) == 2 and any(NUMCELL.match(c) for c in cells):
        return True
    if len(cells) == 1 and NUMCELL.match(s) and len(s) < 40:
        return True  # riga di soli numeri dentro una tabella
    indent = len(l) - len(l.lstrip())
    words = len([w for w in words if len(w) >= 3])
    # righe molto rientrate e brevi senza forma di frase: intestazioni di tabella
    return indent > 12 and len(s) < 60 and words <= 6 and not re.search(r"[.;:]$", s)


def blocks(body):
    """Divide il testo in paragrafi (testo continuo) e tabelle (preformattate)."""
    out, para, table = [], [], []

    def flush_p():
        if para:
            s = re.sub(r"-\s+(?=[a-zà-ù])", "", " ".join(x.strip() for x in para))
            out.append({"t": "p", "s": re.sub(r" +", " ", s)})
            para.clear()

    def flush_t():
        if table:
            while table and not table[-1].strip():
                table.pop()
            ind = min(len(x) - len(x.lstrip()) for x in table if x.strip())
            out.append({"t": "pre", "s": "\n".join(x[ind:] for x in table)})
            table.clear()

    for l in body.splitlines():
        s = l.strip()
        is_tab = tabular(l)
        if not s:
            if table:
                table.append("")
            else:
                flush_p()
            continue
        if is_tab:
            flush_p()
            table.append(l)
        else:
            if table and len(s) < 70 and not s.endswith("."):
                table.append(l)  # didascalie/righe corte dentro una tabella
                continue
            flush_t()
            # testo giustificato: una riga corta che chiude con punto termina il paragrafo
            if para and re.search(r"[.:;]$", para[-1].strip()) and len(para[-1].strip()) < 82:
                flush_p()
            para.append(l)
    flush_p()
    flush_t()
    # i salti di pagina spezzano i paragrafi: si riuniscono quelli che non terminano con punteggiatura forte
    merged = []
    for b in out:
        if merged and b["t"] == "p" and merged[-1]["t"] == "p" and not re.search(r"[.:;]$", merged[-1]["s"]):
            merged[-1]["s"] += " " + b["s"]
        else:
            merged.append(b)
    return merged


def parse_allegati():
    rows = list(csv.DictReader(open(ROOT / "data/allegati/allegati_art135.csv", encoding="utf-8")))
    out = []
    for r in rows:
        out.append({
            "a": r["allegato"], "liv": r["livello"], "min": BY_NAME.get(r["ministero"], ""),
            "cod": r["codice"], "mis": r["missione"], "cmis": r["cod_missione"], "prg": r["programma"],
            "anni": [r["anno_1"], r["anno_2"], r["anno_3"]],
            "v": [int(r[f"importo_{i}"]) for i in (1, 2, 3)],
            "p": [int(r[f"predeterminato_{i}"]) for i in (1, 2, 3)],
        })
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    arts = parse_articoli()
    rt = parse_rt()
    for a in arts:
        if a["n"] in rt:
            a["rt"] = rt[a["n"]]
    data = {
        "ministeri": [{"k": k, "nome": name, "breve": short} for k, name, short, _ in MINISTERI],
        "allegati": parse_allegati(),
        "allegato1": ALLEGATO1,
        "articoli": arts,
        "fonti": {
            "ddl": "Disegno di legge di bilancio 2027-2029, testo (Sezione I) e allegati 1, 5, 6, 7",
            "rt": "Relazione tecnica al disegno di legge di bilancio 2027-2029",
        },
    }
    for f in OUT.iterdir():
        f.unlink()
    p = OUT / "ddl.json"
    json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(p, round(p.stat().st_size / 1e6, 2), "MB;", len(arts), "articoli,", len(rt), "con relazione tecnica")


if __name__ == "__main__":
    main()
