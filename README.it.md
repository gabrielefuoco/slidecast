# Slidecast

Un'applicazione desktop che trasforma una lezione registrata e i suoi appunti Markdown in un insieme di slide che seguono l'audio: Whisper trascrive la registrazione, un modello linguistico scrive le schede, e ogni slide viene agganciata al momento della lezione in cui il suo contenuto viene davvero pronunciato, così la presentazione scorre insieme alla voce.

## Indice

- [Cosa fa](#cosa-fa)
- [Come funziona](#come-funziona)
- [Decisioni](#decisioni)
- [Mappa del repository](#mappa-del-repository)
- [Eseguirlo](#eseguirlo)
- [Limiti](#limiti)

## Cosa fa

- **Trascrive** l'audio della lezione con **faster-whisper**.
- **Genera** slide dalla trascrizione e dal Markdown che l'accompagna: punti chiave, formule LaTeX, schede quiz e flashcard, tramite Mistral AI.
- **Allinea** ogni slide all'audio: il timestamp di una slide è il momento in cui il suo contenuto viene pronunciato, non quello in cui il docente ha cliccato.
- **Organizza** corsi e coppie di file con un'interfaccia drag-and-drop.
- **Esporta** un archivio `.slidepack`, e si distribuisce come installer Windows autonomo.

## Come funziona

### La trascrizione

`WhisperService` avvolge faster-whisper e sceglie il dispositivo all'avvio: `cuda` con `float16` quando c'è una GPU, `cpu` con `int8` altrimenti. Il modello è **`tiny`**, ed è una scelta deliberata discussa qui sotto, non un'ottimizzazione rimasta da un prototipo.

### La generazione

`LLMService` chiede le schede a **Mistral** (`mistral-large-latest`). La trascrizione non viene inviata intera: è tagliata in **finestre da 60 secondi** (`_chunk_segments`), ogni finestra è elaborata in modo asincrono con il Markdown come contesto, e una chiamata separata genera il titolo della presentazione dagli appunti. Il chunking tiene limitato ogni prompt, permette di eseguire le finestre in parallelo, e localizza un errore su un minuto di lezione invece che sull'intera lezione.

### L'allineamento

`SyncService` non esegue un modello di forced alignment. Per ogni slide estrae le keyword dal testo, calcola la sovrapposizione con ogni segmento della trascrizione, e prende il timestamp del segmento con similarità più alta come inizio della slide. I timestamp manuali del file importato sono un primo indizio, non la verità.

È questa scelta a rendere la funzione economica: nessun secondo modello, nessun secondo passaggio sull'audio, e una misura di similarità che tollera gli errori di Whisper — se un termine è trascritto male, le altre keyword della frase portano comunque l'aggancio.

### Il pacchetto

L'applicazione è local-first: SQLAlchemy su **SQLite**, audio servito da una cartella statica montata, nessun account e nessun server da avviare. `slidecast.spec` la compila con PyInstaller e `setup.iss` la avvolge in un installer Inno Setup. Il frontend è React 19 con Vite 7 e Tailwind 4, e l'export `.slidepack` è uno ZIP che si può reimportare.

## Decisioni

**Whisper `tiny` invece di un modello grande.** L'applicazione deve girare sul portatile di un docente, con o senza GPU, e la trascrizione è il passo che decide se lo strumento è utilizzabile. `tiny` la tiene in pochi secondi; un modello più grande migliorerebbe la trascrizione, e dato che l'allineamento è per keyword migliorerebbe soprattutto il testo che l'utente legge, non la sincronizzazione. Il rischio è concreto per le lezioni dense di terminologia, ed è dichiarato qui sotto invece di essere nascosto.

**Allineamento per sovrapposizione di keyword invece del forced alignment.** Il forced alignment significa un modello a livello di fonemi e una pipeline molto più pesante. La sovrapposizione sulle keyword dà un timestamp approssimato con poche righe di codice, e una parola trascritta male non lo rompe. Il prezzo è la precisione: la slide cade vicino alla frase, non sulla sillaba.

**Finestre da 60 secondi.** I prompt lunghi degradano: il modello comincia a riassumere l'inizio e salta la fine. Sessanta secondi sono abbastanza corti per restare fedeli e abbastanza lunghi per produrre una slide vera, con una formula e un punto chiave.

**SQLite, non un database server.** Il portatile di un docente non deve avere bisogno di un servizio avviato. Lo schema è piccolo, le query sono locali, e `.slidepack` copre il caso della condivisione.

**Un installer Windows invece di un `pip install`.** L'utente è un docente, non uno sviluppatore: un installer unico che mette un'icona sul desktop è la differenza tra un progetto e uno strumento che qualcuno usa.

## Mappa del repository

```
backend/
  main.py            applicazione FastAPI: endpoint, import/export, audio statico
  models.py          tabelle SQLAlchemy e schemi Pydantic delle schede
  services/whisper.py   wrapper faster-whisper, scelta di device e compute type
  services/llm.py       chiamate a Mistral, chunking a 60 secondi, generazione del titolo
  services/sync.py      allineamento per sovrapposizione di keyword fra slide e trascrizione
  services/chunking.py  helper di segmentazione del testo
frontend/            React 19 + Vite 7 + Tailwind 4, accoppiamento drag-and-drop
slidecast.spec       build con PyInstaller
setup.iss            script dell'installer Inno Setup
start_app.bat        avvio con doppio clic
```

Circa 2.000 righe di Python.

## Eseguirlo

Sviluppo, dalla radice del repository:

```bash
pip install -r backend/requirements.txt      # o il file dei requirements del backend
cd frontend && npm install && npm run build
python -m backend.main
```

La chiave di Mistral arriva dall'ambiente:

```
MISTRAL_API_KEY=...
```

Su Windows, `start_app.bat` avvia il backend e apre l'interfaccia. Per costruire il distribuibile: `slidecast.spec` (PyInstaller) e poi `setup.iss` (Inno Setup).

## Limiti

| Cosa | Impatto | Stato |
|---|---|---|
| Whisper è `tiny` | il vocabolario tecnico di una lezione italiana viene trascritto in modo grezzo, e quel testo è ciò che l'utente legge | accettato, la prima cosa da alzare con una GPU |
| L'allineamento è approssimato | una slide si aggancia vicino alla frase, non sulla parola; le lezioni dense derivano di più | accettato, per progetto |
| Nessuna qualità misurata | nessuna cifra su accuratezza della trascrizione, errore di allineamento o qualità delle slide: il comportamento si giudica usandolo | aperto, il buco più grande |
| Tre script di test nella radice | `test_api.py`, `test_reorder.py` e `test_reorder_stub.py` lanciano richieste a mano; non c'è suite né CI | aperto |
| Mistral è una dipendenza obbligatoria | la generazione richiede una chiave, una rete e un budget per lezione | accettato |
| Packaging orientato a Windows | installer e `.bat` puntano a Windows; su Linux e macOS resta un checkout del sorgente | accettato |
