"""Scarica dataset BDAP Open Data (Bilancio dello Stato, spese per piano di gestione).

Uso:
    python scripts/fetch_bdap.py lb 2026      # Legge di bilancio pubblicata 2026-2028
    python scripts/fetch_bdap.py dlb 2027     # Disegno di legge di bilancio 2027-2029 (quando pubblicato)

Il server BDAP e' spesso instabile (503, timeout): si usa l'endpoint OData con
paginazione e retry. Output: data/bdap/<tipo>_<anno>_pg.csv
"""
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

CKAN = "https://bdap-opendata.rgs.mef.gov.it/SpodCkanApi/api/3/action"
ODATA = "https://bdap-opendata.rgs.mef.gov.it/ODataProxy/MdData('{guid}@rgs')/DataRows"
TITLES = {
    "lb": "{y} - Legge di Bilancio Pubblicata Elaborabile Spese Piano di Gestione",
    "dlb": "{y} - Disegno Legge di Bilancio Presentato Elaborabile Spese Piano di Gestione",
}
PAGE = 2000
OUT = Path(__file__).resolve().parent.parent / "data" / "bdap"


def get(url, tries=8, timeout=180):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                body = r.read()
            return json.loads(body)
        except Exception as e:  # 503, timeout, html di errore
            last = e
            time.sleep(min(2 ** i, 30))
    raise RuntimeError(f"Impossibile scaricare {url}: {last}")


def find_guid(kind, year):
    title = TITLES[kind].format(y=year)
    q = urllib.parse.quote("Piano di Gestione")
    res = get(f"{CKAN}/package_search?q={q}&rows=500")["result"]["results"]
    for pkg in res:
        if pkg.get("title") == title:
            for r in pkg["resources"]:
                url = r.get("url", "")
                if "ODataProxy" in url:
                    return url.split("MdData('")[1].split("@rgs")[0]
    raise SystemExit(f"Dataset non trovato su BDAP: '{title}'. Probabilmente non ancora pubblicato.")


def main():
    kind, year = sys.argv[1], int(sys.argv[2])
    guid = find_guid(kind, year)
    print("dataset", guid)
    rows, skip = [], 0
    while True:
        url = ODATA.format(guid=guid) + f"?$top={PAGE}&$skip={skip}&$format=json"
        page = get(url)["d"]["results"]
        for r in page:
            r.pop("__metadata", None)
        rows.extend(page)
        print(f"  {len(rows)} righe", flush=True)
        if len(page) < PAGE:
            break
        skip += PAGE
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{kind}_{year}_pg.csv"
    cols = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print("scritto", path, len(rows))


if __name__ == "__main__":
    main()
