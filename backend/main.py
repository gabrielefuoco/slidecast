import shutil
import os
import logging
import zipfile
import uuid
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file BEFORE importing services
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from services.whisper import WhisperService
from services.llm import LLMService
from services.sync import SyncService

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()

# Create temp directory for serving audio files
os.makedirs("temp/audio", exist_ok=True)
app.mount("/audio", StaticFiles(directory="temp/audio"), name="audio")

# Allow CORS for Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

whisper_service = WhisperService()
llm_service = LLMService()
sync_service = SyncService()


@app.post("/import-slidepack")
async def import_slidepack(slidepack: UploadFile = File(...)):
    """
    Importa un file .slidepack (ZIP contenente slides.json + audio).
    Restituisce la presentazione e l'URL dell'audio.
    """
    try:
        logger.info(f"Importing slidepack: {slidepack.filename}")
        
        # Salva lo slidepack temporaneamente
        os.makedirs("temp", exist_ok=True)
        pack_id = str(uuid.uuid4())[:8]
        pack_path = f"temp/{pack_id}.slidepack"
        
        with open(pack_path, "wb") as buffer:
            shutil.copyfileobj(slidepack.file, buffer)
        
        # Estrai il contenuto
        with zipfile.ZipFile(pack_path, 'r') as zf:
            file_list = zf.namelist()
            logger.info(f"Slidepack contents: {file_list}")
            
            # Trova slides.json
            if 'slides.json' not in file_list:
                raise HTTPException(status_code=400, detail="slides.json not found in slidepack")
            
            # Leggi e parse slides.json
            slides_content = zf.read('slides.json').decode('utf-8')
            presentation = sync_service.load_json_from_content(slides_content)
            
            # Trova e estrai l'audio
            audio_file = None
            for f in file_list:
                if f.startswith('audio.'):
                    audio_file = f
                    break
            
            if not audio_file:
                raise HTTPException(status_code=400, detail="Audio file not found in slidepack")
            
            # Estrai l'audio in una cartella servibile
            audio_ext = audio_file.split('.')[-1]
            audio_filename = f"{pack_id}.{audio_ext}"
            audio_dest = f"temp/audio/{audio_filename}"
            
            with zf.open(audio_file) as src, open(audio_dest, 'wb') as dst:
                dst.write(src.read())
            
            logger.info(f"Extracted audio to: {audio_dest}")
        
        # Cleanup pack file
        os.remove(pack_path)
        
        # Restituisci presentazione + URL audio
        return {
            "presentation": presentation,
            "audio_url": f"/audio/{audio_filename}"
        }
        
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid slidepack file (not a valid ZIP)")
    except Exception as e:
        logger.error(f"Error importing slidepack: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate")
async def generate_slides(
    audio: UploadFile = File(...),
    markdown: UploadFile = File(...)
):
    """Genera slide da audio + markdown usando Whisper + LLM."""
    try:
        logger.info(f"Received request: audio={audio.filename}, markdown_size={markdown.size} bytes")

        # 1. Save temp files
        os.makedirs("temp", exist_ok=True)
        audio_path = f"temp/{audio.filename}"
        logger.info(f"Saving audio to {audio_path}")
        with open(audio_path, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)
            
        markdown_content = (await markdown.read()).decode("utf-8")
        logger.info(f"Read markdown content (length: {len(markdown_content)})")
        
        # 2. Transcribe
        logger.info("Starting transcription...")
        segments = whisper_service.transcribe(audio_path)
        logger.info(f"Transcription complete. Found {len(segments)} segments.")
        
        # 3. Generate Slides (using async method directly since we're in FastAPI's event loop)
        logger.info("Starting slide generation with LLM...")
        presentation = await llm_service.generate_slides_async(markdown_content, segments)
        logger.info("Slide generation complete.")
        
        # Cleanup
        os.remove(audio_path)
        logger.info("Cleanup complete.")
        
        return presentation
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
def read_root():
    return {"message": "AudioSlide AI Backend is ready"}


@app.post("/sync")
async def sync_slides(
    slides_json: UploadFile = File(...),
    audio: Optional[UploadFile] = File(None)
):
    """
    Importa slide da un file JSON e opzionalmente le sincronizza con un nuovo audio.
    
    - slides_json: File JSON con la struttura della presentazione
    - audio (opzionale): File audio per ricalcolare i timestamp
    """
    try:
        logger.info(f"Received sync request: json={slides_json.filename}")
        
        # 1. Carica il JSON
        json_content = (await slides_json.read()).decode("utf-8")
        presentation = sync_service.load_json_from_content(json_content)
        logger.info(f"Loaded presentation: {presentation.metadata.title} with {len(presentation.slides)} slides")
        
        # 2. Se c'è un audio, sincronizza
        if audio:
            logger.info(f"Audio provided: {audio.filename}, starting sync...")
            
            # Salva l'audio temporaneamente
            os.makedirs("temp", exist_ok=True)
            audio_path = f"temp/{audio.filename}"
            with open(audio_path, "wb") as buffer:
                shutil.copyfileobj(audio.file, buffer)
            
            # Trascrivi
            logger.info("Transcribing audio for sync...")
            segments = whisper_service.transcribe(audio_path)
            logger.info(f"Transcription complete: {len(segments)} segments")
            
            # Sincronizza
            logger.info("Synchronizing slides with audio...")
            presentation = sync_service.sync_with_audio(presentation, segments)
            logger.info("Sync complete")
            
            # Cleanup
            os.remove(audio_path)
        else:
            logger.info("No audio provided, returning original timestamps")
        
        return presentation
        
    except Exception as e:
        logger.error(f"Error in sync: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

