"""Estrae dagli allegati 5, 6 e 7 del DDL di bilancio (tabelle in immagine, OCR con
tesseract) le variazioni per Ministero / Missione / Programma.

Uso:
    python scripts/parse_allegati.py <cartella_ocr>

<cartella_ocr> contiene p-129.txt ... p-175.txt prodotti da:
    pdftoppm -f 129 -l 175 -r 300 -png Testo_DDLB_2027___2029.pdf p
    for f in p-*.png; do tesseract $f ${f%.png} -l ita --psm 6; done

Il parser verifica le somme (programmi -> missione -> ministero) e segnala le righe
incoerenti; le correzioni manuali verificate sull'immagine sono in CORREZIONI.
Output: data/allegati/allegati_art135.csv
"""
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLEGATI = {  # allegato: (pagine, titolo, anni, segno)
    "5": (range(130, 145), "Riduzioni Titolo II (art. 135, c. 1)", ["2027", "2028", "2029"], -1),
    "6": (range(145, 160), "Incrementi Titolo II (art. 135, c. 1)", ["2030", "2031", "2032"], 1),
    "7": (range(160, 176), "Riduzioni Titolo I (art. 135, c. 2)", ["2027", "2028", "2029+"], -1),
}
NUM = re.compile(r"^\d{1,3}(?:[.,]\d{3})+$|^\d+$")
ZERO = re.compile(r"^[\(\[]?[0oOeDCcl]?[\)\]|]?[fj]?$|^\([0oOe]\)$|^[oO0][|\]fj]$|^l?o\)$")
ROW = re.compile(r"^(MINISTERO [A-Z' ,]+?|PRESIDENZA[A-Z' ,]+?|\d{1,2}\.\d{1,2}\.?|\d{1,2})\s+(.*)$")

# Correzioni puntuali al testo OCR, ciascuna verificata sull'immagine della pagina
# (e coerente con le somme di missione/ministero). Formato: pagina -> [(vecchio, nuovo)]
TEXT_FIXES = {
    133: [("24 (o) 24 (o) 7AS 0", "24 0 24 0 715 0")],
    137: [("210.530 311 210.530 3971", "210.530 311 210.530 311")],
    139: [("24 Sistemi ferroviari", "2.4 Sistemi ferroviari")],
    140: [("34633285 34.577.638]", "34.638.285 34.577.638"), ("—21.261.0001", "21.261.000")],
    142: [("17431765 163409141", "17.431.765 16.340.914")],
    147: [("7.4 Indirizzo politico (2) 15.139", "7.1 Indirizzo politico (2) 15.139")],
    148: [("24 (o) 24 (e) 745 (o)", "24 0 24 0 715 0")],
    152: [("—97.290.602", "91.290.602")],
    153: [("131.1142570", "131.142.570")],
    155: [("2.4. Diritto allo studio (1)", "2.1 Diritto allo studio (1)")],
    169: [("7.192 0 7.792 0", "7.792 0 7.792 0")],
}
# Righe che l'OCR non ha letto (pagina -> righe da aggiungere), trascritte dall'immagine
EXTRA_LINES = {
    162: ["per legge", "23.1 Fondi da assegnare (1) 694.722 0 694.722 0 694.722 0"],
}
# Righe di Totale (illeggibili dall'OCR), trascritte dall'immagine
TOTALI = {
    "5": [1627100597, 1246380249, 1237900452, 1008914207, 1833666974, 1348422875],
    "6": [1560128128, 1179199261, 1180719464, 951733219, 1776485986, 1291241887],
    "7": [234103896, 98539604, 241533555, 108738947, 264782216, 124591678],
}


def tokens(s):
    for ch in "—–=|]{}[;Î":
        s = s.replace(ch, " ")
    return s.split()


def to_val(t):
    t = t.replace(":", ".").replace("A", "4").replace("T", "7") if re.search(r"\d", t) else t
    core = t.strip("()|]}{fjIlÎ;:'`-_.,!")
    if core and re.fullmatch(r"\d[\d.,]*", core):
        return int(core.replace(".", "").replace(",", ""))
    # l'OCR rende gli zeri come O|, (o), (e), C), Ù, Do) ...: token corto senza cifre != 0
    if len(t) <= 3 and not re.search(r"[1-9]", t) and not re.search(r"[a-z]{3}", t):
        return 0
    return None


def split_row(line):
    """Ritorna (descrizione, valori) separando i 6 numeri finali."""
    toks = tokens(line)
    vals, i = [], len(toks)
    while i > 0 and len(vals) < 6:
        t = toks[i - 1]
        v = to_val(t)
        if v is None:
            break
        vals.insert(0, v)
        i -= 1
    return " ".join(toks[:i]), vals


def parse_page(text):
    out = []
    lines = [l for l in text.splitlines() if l.strip()]
    start = 0
    for k, l in enumerate(lines):
        if l.strip().startswith("per legge"):
            start = k + 1
            break
    cur = None
    for l in lines[start:]:
        l = l.replace("(1 1)", "(11)")
        if re.fullmatch(r"\d{3}|[A-Z]{1,3}", l.strip()):  # numero di pagina / residui OCR
            continue
        l = l.strip()
        if l.startswith("Totale"):
            _, vals = split_row(l)
            out.append({"tipo": "totale", "codice": "", "descr": "Totale", "vals": vals, "raw": l})
            cur = None
            continue
        m = ROW.match(l)
        desc, vals = split_row(l)
        if m and len(vals) >= 2:
            code = m.group(1).strip().rstrip(".")
            if code.startswith(("MINISTERO", "PRESIDENZA")):
                cur = {"tipo": "ministero", "codice": "", "descr": desc, "vals": vals, "raw": l}
            else:
                tipo = "programma" if "." in code else "missione"
                cur = {"tipo": tipo, "codice": code, "descr": desc[len(m.group(1)):].strip(), "vals": vals, "raw": l}
            out.append(cur)
        elif len(vals) == 6 and re.match(r"^[a-zA-Z|]{1,2}\s+[A-Z]", l):
            # codice di missione illeggibile ("i", "fl"): ricavato dal programma successivo
            cur = {"tipo": "missione", "codice": "?", "descr": desc.split(None, 1)[1], "vals": vals, "raw": l}
            out.append(cur)
        elif cur is not None and len(vals) < 6:
            cur["descr"] = (cur["descr"] + " " + l).strip()
    return out


def naz_code(d):
    m = re.search(r"\((\d+)\)\s*$", d.strip())
    return m.group(1) if m else ""


def clean_descr(d):
    d = re.sub(r"\s*\(\d+\)\s*$", "", d.strip())  # numero di missione/programma COFOG tra parentesi
    d = d.replace("’", "'").replace('"', "'").replace("Ricercascientifica", "Ricerca scientifica")
    return re.sub(r"\s+", " ", d).replace("Servizie ", "Servizi e ").replace("Accertamentoe", "Accertamento e")


def main():
    ocr = Path(sys.argv[1])
    records, problems = [], []
    for all_, (pages, titolo, anni, segno) in ALLEGATI.items():
        rows = []
        for p in pages:
            text = (ocr / f"p-{p}.txt").read_text()
            for old, new in TEXT_FIXES.get(p, []):
                if old not in text:
                    print(f"  ATTENZIONE: correzione non applicata a p.{p}: {old!r}")
                text = text.replace(old, new)
            if p in EXTRA_LINES:
                text += "\n" + "\n".join(EXTRA_LINES[p])
            rows += parse_page(text)
        for k, r in enumerate(rows):
            if r["codice"] == "?" and k + 1 < len(rows) and "." in rows[k + 1]["codice"]:
                r["codice"] = rows[k + 1]["codice"].split(".")[0]
        ministero = missione = None
        for r in rows:
            if r["tipo"] == "totale":
                r["vals"] = TOTALI[all_]
            if len(r["vals"]) != 6:
                problems.append((all_, r["tipo"], r["codice"], ministero, r["raw"]))
                continue
            if r["tipo"] == "ministero":
                ministero = clean_descr(r["descr"])
                missione = None
                mis_code = ""
            elif r["tipo"] == "missione":
                missione = clean_descr(r["descr"])
                mis_naz = naz_code(r["descr"])
            rec = {
                "allegato": all_, "titolo_allegato": titolo, "livello": r["tipo"],
                "ministero": ministero if r["tipo"] != "totale" else "",
                "codice": r["codice"],
                "missione": missione if r["tipo"] in ("missione", "programma") else "",
                "programma": clean_descr(r["descr"]) if r["tipo"] == "programma" else "",
                "cod_missione": mis_naz if r["tipo"] in ("missione", "programma") else "",
                "cod_programma": naz_code(r["descr"]) if r["tipo"] == "programma" else "",
            }
            for j, a in enumerate(anni):
                rec[f"importo_{j+1}"] = r["vals"][2 * j] * segno
                rec[f"predeterminato_{j+1}"] = r["vals"][2 * j + 1] * segno
                rec[f"anno_{j+1}"] = a
            records.append(rec)
    # verifica somme
    errs = check(records)
    out = ROOT / "data" / "allegati" / "allegati_art135.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(records[0].keys()))
        w.writeheader()
        w.writerows(records)
    print(f"{len(records)} righe -> {out}")
    print(f"{len(problems)} righe non parsate")
    for p in problems:
        print("  PARSE", p)
    print(f"{len(errs)} incoerenze nelle somme")
    for e in errs:
        print("  SOMMA", e)


def check(records):
    errs = []
    keys = [f"importo_{i}" for i in (1, 2, 3)] + [f"predeterminato_{i}" for i in (1, 2, 3)]
    by_all = {}
    for r in records:
        by_all.setdefault(r["allegato"], []).append(r)
    for a, rs in by_all.items():
        tot_min = {k: 0 for k in keys}
        i = 0
        while i < len(rs):
            r = rs[i]
            if r["livello"] == "ministero":
                j = i + 1
                acc_m = {k: 0 for k in keys}
                while j < len(rs) and rs[j]["livello"] in ("missione", "programma"):
                    if rs[j]["livello"] == "missione":
                        mis = rs[j]
                        acc_m = {k: acc_m[k] + mis[k] for k in keys}
                        acc_p = {k: 0 for k in keys}
                        j += 1
                        while j < len(rs) and rs[j]["livello"] == "programma":
                            acc_p = {k: acc_p[k] + rs[j][k] for k in keys}
                            j += 1
                        for k in keys:
                            if acc_p[k] != mis[k]:
                                errs.append((a, r["ministero"][:40], "missione", mis["codice"], k, mis[k], acc_p[k]))
                    else:
                        errs.append((a, r["ministero"][:40], "programma senza missione", rs[j]["codice"]))
                        j += 1
                for k in keys:
                    if acc_m[k] != r[k]:
                        errs.append((a, r["ministero"][:40], "ministero", k, r[k], acc_m[k]))
                    tot_min[k] += r[k]
                i = j
            elif r["livello"] == "totale":
                for k in keys:
                    if tot_min[k] != r[k]:
                        errs.append((a, "TOTALE", k, r[k], tot_min[k]))
                i += 1
            else:
                errs.append((a, "riga orfana", r["codice"]))
                i += 1
    return errs


if __name__ == "__main__":
    main()
