# Legge di bilancio 2027-2029: lettura guidata

Sito statico (HTML/CSS/JS, nessuna dipendenza) per leggere il disegno di legge di bilancio 2027-2029. Si apre con una domanda ("Ti interessa qualcosa di particolare?") e porta l'utente agli articoli e ai numeri partendo da un Ministero, da una missione/programma o da un argomento. Online: https://mcaruso17.github.io/bilanciodellostato/

## Percorsi

| Pagina | Contenuto |
|---|---|
| Inizio | Domanda iniziale: "Sì" porta alla scelta del percorso, "No, fammi vedere tutto" alla panoramica |
| Esplora | Ministero, missione e programma, argomento |
| Scheda Ministero / missione / programma | Articoli collegati, poi grafici e valori degli allegati 5, 6, 7, poi le schede dei programmi |
| Argomento | Ricerca nel testo dei 157 articoli e nella Relazione tecnica, con i programmi pertinenti |
| Tutto | Allegato 1 (saldi), riduzioni per Ministero, spostamento 2027-29 verso 2030-32, tabella per Ministero o missione |
| Articoli | Tutti gli articoli; ognuno si apre con testo del DDL (commi con importi in evidenza) e Relazione tecnica |

## Fonti

Solo i due documenti ufficiali nel repository:

- `Testo_DDLB_2027___2029.pdf`: articolato, allegato 1 (risultati differenziali), allegati 5, 6, 7 (art. 135, riduzioni e incrementi per Ministero, missione, programma).
- `Relazione_tecnica.pdf`: testo per articolo (articoli 1-137, stessa numerazione del DDL).

Le tabelle degli allegati 5-7 sono immagini: sono lette con OCR e validate con i totali (programmi, missioni, Ministeri, totale di allegato: nessuna incoerenza). Le correzioni manuali sono in `scripts/parse_allegati.py` con il numero di pagina.

## Rigenerare i dati

```bash
pdftotext -layout Testo_DDLB_2027___2029.pdf data/ddl_testo.txt
pdftotext -layout Relazione_tecnica.pdf data/rt_testo.txt
python3 scripts/parse_allegati.py <cartella_ocr>   # vedi docstring per i comandi OCR
python3 scripts/build_data.py                      # genera docs/data/ddl.json
```

Locale: `cd docs && python3 -m http.server 8000`.

## Limiti

- Gli importi degli allegati sono per programma: il DDL non li ripartisce per capitolo o piano gestionale.
- Articolo e Ministero sono collegati quando l'articolo cita il Ministero; articolo e missione/programma sono collegati per parole chiave del nome (collegamento testuale, segnalato nel sito).
