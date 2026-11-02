# Bilancio dello Stato: dashboard DDL di bilancio 2027-2029

Dashboard statica (HTML/CSS/JS, nessuna dipendenza) per analizzare le riduzioni e le rimodulazioni di spesa del disegno di legge di bilancio 2027-2029, per settore, fino al livello di piano gestionale.

## Viste

| Vista | Contenuto |
|---|---|
| Panoramica | Totali art. 135 (allegati 5, 6, 7), riduzioni per Ministero e anno, spostamento temporale Titolo II (2027-29 vs 2030-32), programmi più colpiti |
| Riduzioni per settore | Albero Ministero > missione > programma oppure missione (settore) > Ministero > programma, con peso sul totale e sulla spesa non rigida LB 2026 |
| Analisi programma | Riduzioni del programma, baseline LB 2026 per titolo, simulatore di ripartizione della riduzione sui piani gestionali (pro quota o manuale, export CSV) |
| Piani gestionali | Tutti i PG della LB 2026-2028 con filtri e ordinamento per calo a legislazione vigente |
| Variazioni DLB per PG | Scomposizione per PG (legislazione vigente, rimodulazioni, rif./def./rip., effetti Sez. I, DLB integrato): si attiva quando RGS pubblica il dataset DLB 2027 su BDAP. Include l'allegato 4 (unico allegato con dettaglio per PG) |
| Articolato | Ricerca nel testo dei 157 articoli |

## Avvio locale

```bash
cd docs && python3 -m http.server 8000
```

Poi aprire http://localhost:8000. Pubblicabile con GitHub Pages dalla cartella `docs/`.

## Dati e pipeline

```bash
python3 scripts/fetch_bdap.py lb 2026      # LB 2026 per piano gestionale (copia compressa in data/bdap/*.csv.gz)
python3 scripts/fetch_bdap.py dlb 2027     # DLB 2027 per piano gestionale, quando pubblicato su BDAP
python3 scripts/parse_allegati.py <ocr>    # allegati 5, 6, 7 dal PDF (vedi docstring per i comandi OCR)
python3 scripts/build_data.py              # genera docs/data/*.json
```

- `data/allegati/allegati_art135.csv`: allegati 5, 6, 7 per Ministero/missione/programma. Estratti via OCR (le tabelle del PDF sono immagini) e validati: ogni programma somma alla missione, ogni missione al Ministero, ogni Ministero al totale di allegato. Le correzioni manuali sono elencate in `scripts/parse_allegati.py` con la pagina di riferimento.
- `data/allegati/allegato4_art86.csv`: allegato 4, trascritto a mano.
- `data/bdap/lb_2026_pg.csv.gz`: BDAP Open Data, Legge di bilancio 2026 pubblicata, spese per piano di gestione.

## Limiti

- Il PDF caricato contiene la Sezione I: le riduzioni sono per programma. Il dettaglio per capitolo/PG del DLB 2027 sarà disponibile solo con il dataset BDAP del DLB (non ancora pubblicato al 2 novembre 2026).
- La LB 2026 è usata come baseline: non coincide con il tendenziale del DLB 2027 e non copre il 2029.
- La "rigidità" per categoria economica è un'euristica, non la classificazione oneri inderogabili / fattore legislativo / fabbisogno.
