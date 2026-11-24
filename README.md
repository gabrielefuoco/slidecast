# Slidecast

A desktop application that turns a recorded lecture and its Markdown notes into a set of slides that follow the audio: Whisper transcribes the recording, an LLM writes the cards, and each slide is pinned to the moment of the lecture where its content is actually spoken, so the presentation plays along with the voice.

## Table of contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Decisions](#decisions)
- [Repository map](#repository-map)
- [Running it](#running-it)
- [Limitations](#limitations)

## What it does

- **Transcribes** the lecture audio with **faster-whisper**.
- **Generates** slides from the transcript and the accompanying Markdown: key points, LaTeX formulas, quiz and flashcard cards, through Mistral AI.
- **Aligns** each slide to the audio: the timestamp of a slide is the moment where its content is spoken, not where the lecturer happened to click.
- **Organises** courses and file pairs with a drag-and-drop interface.
- **Exports** a `.slidepack` archive, and ships as a standalone Windows installer.

## How it works

### Transcription

`WhisperService` wraps faster-whisper and selects the device at startup: `cuda` with `float16` when a GPU is available, `cpu` with `int8` otherwise. The model is **`tiny`**, and that is a deliberate choice discussed below rather than an optimisation left over from a prototype.

### Generation

`LLMService` asks **Mistral** (`mistral-large-latest`) for the cards. The transcript is not sent whole: it is cut into **60-second chunks** (`_chunk_segments`), each chunk is processed asynchronously with the Markdown as context, and a separate call generates the presentation title from the notes. Chunking keeps every prompt bounded, lets the chunks run concurrently, and localises a failure to one minute of lecture instead of the whole lesson.

### Alignment

`SyncService` does not run a forced-alignment model. For each slide it extracts the keywords from the text, computes the overlap with every transcript segment, and takes the timestamp of the segment with the highest similarity as the slide's start. The manual timestamps in the imported file are treated as a first guess, not as truth.

That choice is what makes the feature cheap: no second model, no second pass over the audio, and a similarity measure that tolerates Whisper's mistakes — if a term is transcribed badly, the other keywords in the sentence still carry the match.

### Packaging

The application is local-first: SQLAlchemy over **SQLite**, audio served from a mounted static folder, no account and no server to run. `slidecast.spec` builds it with PyInstaller and `setup.iss` wraps it in an Inno Setup installer. The frontend is React 19 with Vite 7 and Tailwind 4, and the `.slidepack` export is a ZIP that can be imported back.

## Decisions

**Whisper `tiny` instead of a large model.** The application must run on a lecturer's laptop, with or without a GPU, and transcription is the step that decides whether the tool is usable at all. `tiny` keeps it in seconds; a larger model would improve the transcript, and since the alignment is keyword-based it would mostly improve the text shown to the user, not the synchronisation. The risk is real for lectures dense in terminology, and it is stated below rather than hidden.

**Alignment by keyword overlap instead of forced alignment.** Forced alignment means a phoneme-level model and a much heavier pipeline. Overlap on keywords gives an approximate timestamp with a few lines of code, and a wrong transcript word does not break it. The cost is precision: the slide lands near the sentence, not on the syllable.

**Chunks of 60 seconds.** Long prompts degrade: the model starts summarising the beginning and skipping the end. Sixty seconds is short enough to stay faithful and long enough to produce a real slide with a formula and a key point.

**SQLite, not a database server.** A teacher's laptop should not need a service to be started. The schema is small, the queries are local, and `.slidepack` covers the sharing case.

**A Windows installer instead of a `pip install`.** The user is a lecturer, not a developer: a one-file installer that puts an icon on the desktop is the difference between a project and a tool someone uses.

## Repository map

```
backend/
  main.py            FastAPI app: endpoints, import/export, static audio
  models.py          SQLAlchemy tables and Pydantic card schemas
  services/whisper.py   faster-whisper wrapper, device and compute type selection
  services/llm.py       Mistral calls, 60-second chunking, title generation
  services/sync.py      keyword-overlap alignment between slides and transcript
  services/chunking.py  text segmentation helpers
frontend/            React 19 + Vite 7 + Tailwind 4, drag-and-drop pairing
slidecast.spec       PyInstaller build
setup.iss            Inno Setup installer script
start_app.bat        double-click entry point
```

Around 2,000 lines of Python.

## Running it

Development, from the repository root:

```bash
pip install -r backend/requirements.txt      # or the requirements file for the backend
cd frontend && npm install && npm run build
python -m backend.main
```

The Mistral key comes from the environment:

```
MISTRAL_API_KEY=...
```

On Windows, `start_app.bat` starts the backend and opens the interface. To build the distributable, `slidecast.spec` (PyInstaller) then `setup.iss` (Inno Setup).

## Limitations

| Item | Impact | Status |
|---|---|---|
| Whisper is `tiny` | technical vocabulary in an Italian lecture is transcribed roughly, and that text is what the user reads | accepted, the first thing to upgrade with a GPU |
| Alignment is approximate | a slide is pinned near the sentence, not on the word; dense lectures drift more | accepted, by design |
| No measured quality | no figure for transcript accuracy, alignment error or slide quality: the behaviour is judged by using it | open, the biggest gap |
| Three ad-hoc test scripts at the root | `test_api.py`, `test_reorder.py`, `test_reorder_stub.py` script requests by hand; there is no suite and no CI | open |
| Mistral is a hard dependency | generation needs a key, a network and a budget per lecture | accepted |
| Windows-first packaging | the installer and the `.bat` target Windows; on Linux and macOS it stays a source checkout | accepted |
