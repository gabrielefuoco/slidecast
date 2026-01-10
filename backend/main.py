import shutil
import os
import logging
import zipfile
import uuid
from typing import Optional, List, Union
from models import StandardCard, QuizCard, PresentationManifest

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
from pydub import AudioSegment


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
def import_slidepack(slidepack: UploadFile = File(...)):
    """
    Importa un file .slidepack (ZIP) o un Export Corso (ZIP con cartelle).
    - Se contiene multipli slides.json -> Importa come Corso.
    - Se contiene un solo slides.json -> Importa come singola presentazione (gestisce nesting).
    """
    try:
        logger.info(f"Importing zip: {slidepack.filename}")
        
        # Salva lo zip temporaneamente
        os.makedirs("temp", exist_ok=True)
        zip_id = str(uuid.uuid4())[:8]
        zip_path = f"temp/{zip_id}.zip"
        
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(slidepack.file, buffer)
        
        presentation_to_return = None
        audio_url_to_return = None
        
        with zipfile.ZipFile(zip_path, 'r') as zf:
            file_list = zf.namelist()
            # Trova tutti i slides.json
            slides_files = [f for f in file_list if f.endswith('slides.json') and not f.startswith('__MACOSX')]
            
            if not slides_files:
                raise HTTPException(status_code=400, detail="No slides.json found in archive")

            db = SessionLocal()
            
            # --- CASO BULK / CORSO ---
            if len(slides_files) > 1:
                logger.info(f"Bulk import detected: {len(slides_files)} packs found.")
                
                # Crea nuovo corso
                course_title = os.path.splitext(slidepack.filename)[0]
                course = Course(title=course_title)
                db.add(course)
                db.commit()
                db.refresh(course)
                logger.info(f"Created course: {course.title} (ID: {course.id})")
                
                # Importa ogni pack
                for i, slides_path in enumerate(slides_files):
                    try:
                        # slides_path es: "Cartella/Sottocartella/slides.json"
                        # root_dir es: "Cartella/Sottocartella/"
                        root_dir = os.path.dirname(slides_path)
                        
                        # Leggi JSON
                        slides_content = zf.read(slides_path).decode('utf-8')
                        presentation = sync_service.load_json_from_content(slides_content)
                        
                        # Crea SlidePack nel DB
                        pack = SlidePack(
                            title=presentation.metadata.title, 
                            status="completed", 
                            course_id=course.id,
                            order_index=i
                        )
                        db.add(pack)
                        db.commit()
                        db.refresh(pack)
                        
                        # Prepara destinazione
                        output_dir = f"storage/courses/{course.id}/{pack.id}"
                        os.makedirs(output_dir, exist_ok=True)
                        pack.file_path = output_dir
                        
                        # Salva slides.json
                        with open(f"{output_dir}/slides.json", "w", encoding='utf-8') as f:
                            f.write(slides_content)
                            
                        # Trova l'audio nella stessa cartella di slides.json
                        audio_file_entry = None
                        for f in file_list:
                            # Deve iniziare con la root_dir e finire con estensione audio
                            # Esempio check: f è "Cartella/audio.mp3" e root è "Cartella"
                            if os.path.dirname(f) == root_dir and f.split('/')[-1].startswith('audio.'):
                                audio_file_entry = f
                                break
                        
                        if audio_file_entry:
                            audio_ext = audio_file_entry.split('.')[-1]
                            final_audio_path = f"{output_dir}/audio.{audio_ext}"
                            with zf.open(audio_file_entry) as src, open(final_audio_path, 'wb') as dst:
                                dst.write(src.read())
                        else:
                            logger.warning(f"Audio not found for pack {slides_path}")
                        
                        db.commit()
                        
                        # Imposta il primo come ritorno (preview)
                        if i == 0:
                            presentation_to_return = presentation
                            if audio_file_entry:
                                # URL per il frontend
                                audio_filename = f"audio.{audio_ext}"
                                presentation_to_return = presentation
                                audio_url_to_return = f"/storage/courses/{course.id}/{pack.id}/{audio_filename}"

                    except Exception as e:
                        logger.error(f"Failed to import pack {slides_path}: {e}")
                        continue

            # --- CASO SINGOLO (anche nested) ---
            else:
                slides_path = slides_files[0]
                root_dir = os.path.dirname(slides_path)
                logger.info(f"Single import detected: {slides_path} (root: {root_dir})")
                
                # Create Course & Pack for persistence
                # Use filename as course title or default
                course_title = os.path.splitext(slidepack.filename)[0]
                course = Course(title=course_title)
                db.add(course)
                db.commit()
                db.refresh(course)
                
                # Leggi JSON
                slides_content = zf.read(slides_path).decode('utf-8')
                presentation = sync_service.load_json_from_content(slides_content)
                presentation_to_return = presentation
                
                # Create Pack
                pack = SlidePack(
                    title=presentation.metadata.title,
                    status="completed",
                    course_id=course.id,
                    order_index=0
                )
                db.add(pack)
                db.commit()
                db.refresh(pack)
                
                # Prepare destination
                output_dir = f"storage/courses/{course.id}/{pack.id}"
                os.makedirs(output_dir, exist_ok=True)
                pack.file_path = output_dir
                
                # Save slides.json
                with open(f"{output_dir}/slides.json", "w", encoding='utf-8') as f:
                    f.write(slides_content)
                
                # Trova Audio
                audio_file_entry = None
                for f in file_list:
                    if os.path.dirname(f) == root_dir and f.split('/')[-1].startswith('audio.'):
                        audio_file_entry = f
                        break
                
                if not audio_file_entry:
                    raise HTTPException(status_code=400, detail="Audio file not found in archive")

                # Extract audio to storage
                audio_ext = audio_file_entry.split('.')[-1]
                final_audio_path = f"{output_dir}/audio.{audio_ext}"
                with zf.open(audio_file_entry) as src, open(final_audio_path, 'wb') as dst:
                    dst.write(src.read())
                
                db.commit()
                
                # Return Persistent URL
                audio_filename = f"audio.{audio_ext}"
                audio_url_to_return = f"/storage/courses/{course.id}/{pack.id}/{audio_filename}"

            db.close()
        
        # Cleanup zip
        os.remove(zip_path)
        
        if not presentation_to_return:
             raise HTTPException(status_code=500, detail="Import failed: no valid presentations found")
             
        # Se era un bulk import ma audio_url_to_return è None (magari il primo è fallito audio?), gestiamo
        if not audio_url_to_return:
             # Fallback vuoto o errore?
             pass 

        return {
            "presentation": presentation_to_return,
            "audio_url": audio_url_to_return
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


@app.get("/api/health")
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

# --- BATCH & DATABASE LOGIC ---

from typing import List
from fastapi import BackgroundTasks
from database import SessionLocal, init_db, Course, SlidePack
from pydantic import BaseModel

from datetime import datetime

# Init DB on module load
# Init DB on module load
init_db()

# Migration hack: Check if order_index exists, if not add it
def run_migrations():
    try:
        from sqlalchemy import text
        db = SessionLocal()
        # Check if column exists (naive check)
        try:
            db.execute(text("SELECT order_index FROM slidepacks LIMIT 1"))
        except Exception:
            logger.info("Migrating: Adding order_index to slidepacks")
            db.execute(text("ALTER TABLE slidepacks ADD COLUMN order_index INTEGER DEFAULT 0"))
            db.commit()
        db.close()
    except Exception as e:
        logger.error(f"Migration failed: {e}")

run_migrations()

async def process_batch_queue(files_data: List[dict], course_id: int):
    """
    Processa una lista di file (già salvati su disco) in background.
    Ogni elemento in files_data è un dict: {'audio_path': str, 'md_path': str, 'filename': str}
    """
    db = SessionLocal()
    
    for item in files_data:
        audio_path = item['audio_path']
        md_path = item['md_path']
        filename = item['filename']
        
        # 1. Crea entry nel DB "Processing"
        # Se c'è già un pack con questo nome nel corso, magari aggiornalo? Per ora creiamo nuovo.
        new_pack = SlidePack(title=filename, status="processing", course_id=course_id)
        db.add(new_pack)
        db.commit()
        db.refresh(new_pack)
        
        try:
            logger.info(f"Processing batch item: {filename} (ID: {new_pack.id})")
            
            # Leggi Markdown
            with open(md_path, 'r', encoding='utf-8') as f:
                markdown_content = f.read()
                
            # 2. Transcribe
            logger.info(f"Transcribing {audio_path}...")
            segments = whisper_service.transcribe(audio_path)
            
            # 3. Generate Slides
            logger.info(f"Generating slides for {filename}...")
            presentation = await llm_service.generate_slides_async(markdown_content, segments)
            
            # 4. Salva il risultato su disco (come se fosse un export)
            # Struttura: storage/courses/{course_id}/{pack_id}/
            output_dir = f"storage/courses/{course_id}/{new_pack.id}"
            os.makedirs(output_dir, exist_ok=True)
            
            # Salva slides.json
            with open(f"{output_dir}/slides.json", "w", encoding='utf-8') as f:
                f.write(presentation.model_dump_json(indent=2))
                
            # Salva/Sposta l'audio finale (utile per il player)
            # Copiamo l'audio nella cartella del pack
            audio_ext = audio_path.split('.')[-1]
            final_audio_path = f"{output_dir}/audio.{audio_ext}"
            shutil.copy(audio_path, final_audio_path)
            
            # Aggiorna DB "Completed"
            new_pack.status = "completed"
            new_pack.title = presentation.metadata.title # Aggiorna titolo con quello generato
            new_pack.file_path = output_dir
            db.commit()
            
            logger.info(f"Batch item {filename} completed successfully.")
            
        except Exception as e:
            new_pack.status = "failed"
            db.commit()
            logger.error(f"Error processing batch item {filename}: {e}", exc_info=True)
            
        finally:
            # Cleanup temp files for this item
            try:
                if os.path.exists(audio_path): os.remove(audio_path)
                if os.path.exists(md_path): os.remove(md_path)
            except Exception as cleanup_err:
                logger.warning(f"Failed cleanup for {filename}: {cleanup_err}")
    
    db.close()


@app.post("/upload-batch/")
def upload_batch(
    background_tasks: BackgroundTasks,
    audio_files: List[UploadFile] = File(...),
    md_files: List[UploadFile] = File(...),
    course_name: str = Form(None)
):
    # 1. Gestione Corso
    db = SessionLocal()
    if not course_name:
        course_name = f"Corso del {datetime.now().strftime('%d/%m/%Y %H:%M')}"
        
    course = Course(title=course_name)
    db.add(course)
    db.commit()
    db.refresh(course)
    course_id = course.id
    db.close()
    
    logger.info(f"Created course '{course_name}' (ID: {course_id}) for batch upload.")
    
    # 2. Salva fisicamente i file prima di processarli
    # Cerchiamo di accoppiarli per nome (senza estensione)
    # Es: lezione1.mp3 -> lezione1.md
    
    os.makedirs("temp/batch", exist_ok=True)
    files_to_process = []
    
    # Crea mappe nome -> file
    audio_map = {os.path.splitext(f.filename)[0]: f for f in audio_files}
    md_map = {os.path.splitext(f.filename)[0]: f for f in md_files}
    
    # Trova le coppie
    common_names = set(audio_map.keys()) & set(md_map.keys())
    
    if not common_names:
        raise HTTPException(status_code=400, detail="No matching audio/markdown pairs found (filenames must match)")
    
    for name in common_names:
        af = audio_map[name]
        mf = md_map[name]
        
        # Salva Audio
        a_path = f"temp/batch/{uuid.uuid4()}_{af.filename}"
        with open(a_path, "wb") as buffer:
            shutil.copyfileobj(af.file, buffer)
            
        # Salva MD
        m_path = f"temp/batch/{uuid.uuid4()}_{mf.filename}"
        with open(m_path, "wb") as buffer:
            shutil.copyfileobj(mf.file, buffer)
            
        files_to_process.append({
            'audio_path': a_path,
            'md_path': m_path,
            'filename': name
        })
        
    logger.info(f"Queued {len(files_to_process)} pairs for processing.")
    
    # 3. Avvia il task in background
    background_tasks.add_task(process_batch_queue, files_to_process, course_id)
    
    return {"message": "Batch processing started", "course_id": course_id, "pairs_count": len(files_to_process)}

@app.get("/courses")
def list_courses():
    db = SessionLocal()
    courses = db.query(Course).all()
    
    result = []
    for c in courses:
        packs = []
        for p in c.slidepacks:
            packs.append({
                "id": p.id,
                "title": p.title,
                "status": p.status,
                "created_at": p.created_at,
                "order_index": p.order_index,
                "course_id": p.course_id
            })
        # Sort packs by order_index, then created_at
        packs.sort(key=lambda x: (x.get('order_index', 0), x.get('created_at', '')))
        
        result.append({
            "id": c.id,
            "title": c.title,
            "created_at": c.created_at,
            "slidepacks": packs
        })
    
    db.close()
    return result

@app.get("/export-course/{course_id}")
def export_course(course_id: int):
    db = SessionLocal()
    course = db.query(Course).filter(Course.id == course_id).first()
    
    if not course:
        db.close()
        raise HTTPException(status_code=404, detail="Course not found")

    # Crea una cartella temporanea per il zip
    base_dir = f"temp/export_{course_id}"
    if os.path.exists(base_dir):
        shutil.rmtree(base_dir)
    os.makedirs(base_dir, exist_ok=True)
    
    has_content = False
    for pack in course.slidepacks:
        if pack.status == 'completed' and pack.file_path and os.path.exists(pack.file_path):
            # Copia la cartella del singolo slidepack dentro la cartella export
            # Struttura: Export/Lezione_1_ID/, Export/Lezione_2_ID/
            # Sanitize filename: remove invalid chars
            safe_title = "".join(c for c in pack.title if c.isalnum() or c in (' ', '-', '_')).strip()
            safe_title = safe_title.replace(" ", "_")
            
            dest_name = f"{safe_title}_{pack.id}" 
            shutil.copytree(pack.file_path, f"{base_dir}/{dest_name}")
            has_content = True

    if not has_content:
        db.close()
        # Clean up empty dir
        shutil.rmtree(base_dir)
        # Instead of error, return empty zip maybe? Or just error is fine if UI handles it.
        # User expects something. Let's error clearly.
        raise HTTPException(status_code=400, detail="No completed slidepacks to export in this course.")

    # Zippa tutto
    zip_filename = f"course_{course_id}"
    shutil.make_archive(f"temp/{zip_filename}", 'zip', base_dir)
    
    # Cleanup folder
    shutil.rmtree(base_dir)
    db.close()
    
    # Sanitize course title for filename
    safe_course_title = "".join(c for c in course.title if c.isalnum() or c in (' ', '-', '_')).strip()
    return FileResponse(f"temp/{zip_filename}.zip", filename=f"{safe_course_title}.zip")


# New: Mount storage for serving persisted files
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)
app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")

@app.get("/slidepack/{pack_id}")
def get_slidepack(pack_id: int):
    """Retrieves slidepack data (JSON + Audio URL) for playback."""
    import json # Ensure json is available
    db = SessionLocal()
    pack = db.query(SlidePack).filter(SlidePack.id == pack_id).first()
    
    if not pack:
        db.close()
        raise HTTPException(status_code=404, detail="Slidepack not found")
        
    if pack.status != 'completed':
        db.close()
        raise HTTPException(status_code=400, detail="Slidepack is not ready")

    if not pack.file_path or not os.path.exists(pack.file_path):
        db.close()
        raise HTTPException(status_code=404, detail="Slidepack files missing from storage")
    
    # Load JSON
    json_path = os.path.join(pack.file_path, "slides.json")
    if not os.path.exists(json_path):
        db.close()
        raise HTTPException(status_code=404, detail="slides.json not found")
        
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            presentation = json.load(f)
    except Exception as e:
        db.close()
        raise HTTPException(status_code=500, detail=f"Failed to parse slides.json: {str(e)}")
        
    # Find Audio File
    audio_filename = None
    for f in os.listdir(pack.file_path):
        if f.startswith("audio."):
            audio_filename = f
            break
            
    if not audio_filename:
        db.close()
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Construct URL
    # file_path is something like "storage/courses/1/5"
    # we need relative path from "storage/" -> "courses/1/5"
    rel_path = os.path.relpath(pack.file_path, "storage").replace("\\", "/")
    audio_url = f"/storage/{rel_path}/{audio_filename}"
    
    db.close()
    
    return {
        "presentation": presentation,
        "audio_url": audio_url
    }


# --- EDITING & MANIPULATION ENDPOINTS ---

class RenameRequest(BaseModel):
    title: str

class MoveRequest(BaseModel):
    course_id: int

class MergeRequest(BaseModel):
    title: str
    pack_ids: List[int]

@app.patch("/courses/{course_id}")
def rename_course(course_id: int, request: RenameRequest):
    db = SessionLocal()
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        db.close()
        raise HTTPException(status_code=404, detail="Course not found")
    
    course.title = request.title
    db.commit()
    db.refresh(course)
    db.close()
    db.close()
    return {"message": "Course renamed", "course": course}

class ReorderRequest(BaseModel):
    pack_ids: List[int]

@app.post("/courses/{course_id}/reorder")
def reorder_course(course_id: int, request: ReorderRequest):
    logger.info(f"Reordering course {course_id} with packs: {request.pack_ids}")
    db = SessionLocal()
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        db.close()
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Update order indices
    for index, pack_id in enumerate(request.pack_ids):
        pack = db.query(SlidePack).filter(SlidePack.id == pack_id, SlidePack.course_id == course_id).first()
        if pack:
            pack.order_index = index
            
    db.commit()
    db.close()
    return {"message": "Order updated"}

@app.delete("/courses/{course_id}")
def delete_course(course_id: int):
    db = SessionLocal()
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        db.close()
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Delete files
    # Check if there are slidepacks and delete their folders
    for pack in course.slidepacks:
        if pack.file_path and os.path.exists(pack.file_path):
            try:
                shutil.rmtree(pack.file_path)
            except Exception as e:
                logger.warning(f"Failed to delete pack folder {pack.file_path}: {e}")
    
    db.delete(course)
    db.commit()
    db.close()
    return {"message": "Course deleted"}

@app.patch("/slidepacks/{pack_id}")
def update_slidepack(pack_id: int, 
                     rename: Optional[RenameRequest] = None, 
                     move: Optional[MoveRequest] = None):
    """
    Unified endpoint to Rename OR Move a slidepack.
    Pass 'rename' body to rename.
    Pass 'move' body to move.
    """
    # Note: FastAPI might struggle with two optional bodies like this in some versions,
    # but sticking to separate endpoints is cleaner. I will separate them below for clarity 
    # and to avoid "body" conflicts or validation issues.
    pass 

@app.patch("/slidepacks/{pack_id}/rename")
def rename_slidepack(pack_id: int, request: RenameRequest):
    db = SessionLocal()
    pack = db.query(SlidePack).filter(SlidePack.id == pack_id).first()
    if not pack:
        db.close()
        raise HTTPException(status_code=404, detail="SlidePack not found")
    
    pack.title = request.title
    
    # Sync with slides.json on disk so Player sees the new title
    try:
        if pack.file_path:
            json_path = os.path.join(pack.file_path, "slides.json")
            if os.path.exists(json_path):
                import json
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    
                # Update title in metadata
                if "metadata" in data:
                    data["metadata"]["title"] = request.title
                else:
                    data["metadata"] = {"title": request.title, "duration": 0}
                    
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to sync title to slides.json: {e}")
        # Non-blocking error, but good to log
    
    db.commit()
    db.close()
    return {"message": "SlidePack renamed"}

@app.patch("/slidepacks/{pack_id}/move")
def move_slidepack(pack_id: int, request: MoveRequest):
    db = SessionLocal()
    pack = db.query(SlidePack).filter(SlidePack.id == pack_id).first()
    if not pack:
        db.close()
        raise HTTPException(status_code=404, detail="SlidePack not found")
        
    target_course = db.query(Course).filter(Course.id == request.course_id).first()
    if not target_course:
        db.close()
        raise HTTPException(status_code=404, detail="Target Course not found")
    
    # Ideally we should move the files on disk too to keep structure organized 
    # (storage/courses/{course_id}/{pack_id}), but the current code uses 
    # pack.file_path which is absolute string path.
    # So moving files is optional IF we trust file_path column.
    # But let's move them to keep folders clean.
    
    old_path = pack.file_path
    if old_path and os.path.exists(old_path):
        new_dir = f"storage/courses/{request.course_id}/{pack.id}"
        if old_path != new_dir:
            try:
                # Ensure target parent exists
                os.makedirs(f"storage/courses/{request.course_id}", exist_ok=True)
                shutil.move(old_path, new_dir)
                pack.file_path = new_dir
            except Exception as e:
                logger.error(f"Failed to move files: {e}")
                # If move fails, we might just update the ID and keep files where they are?
                # No, safer to fail or just update ID if move isn't critical.
                # Let's abort if files exist but can't be moved to avoid inconsistency.
                db.close()
                raise HTTPException(status_code=500, detail=f"Failed to move files: {e}")

    pack.course_id = request.course_id

@app.patch("/slidepacks/{pack_id}/cards")
def update_slidepack_cards(pack_id: int, cards: List[Union[QuizCard, StandardCard]]):
    db = SessionLocal()
    pack = db.query(SlidePack).filter(SlidePack.id == pack_id).first()
    
    if not pack:
        db.close()
        raise HTTPException(status_code=404, detail="SlidePack not found")

    if not pack.file_path or not os.path.exists(pack.file_path):
        db.close()
        raise HTTPException(status_code=404, detail="Slidepack files missing")
    
    json_path = os.path.join(pack.file_path, "slides.json")
    
    try:
        import json
        
        # 1. Read existing slides.json
        if not os.path.exists(json_path):
             # Should be rare if pack exists
             raise HTTPException(status_code=404, detail="slides.json not found")
             
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # 2. Update cards field
        # Convert Pydantic models to dicts
        cards_data = [card.model_dump() for card in cards]
        data['cards'] = cards_data
        
        # 3. Validate entire manifest (optional but good for safety)
        # We try to validate the whole thing against PresentationManifest to be sure we didn't break anything
        # (Though we modified a dictionary, so we are just adding 'cards')
        try:
            PresentationManifest(**data)
        except Exception as validation_err:
             logger.error(f"Validation failed after card injection: {validation_err}")
             # We might still want to save if it's just a partial issue, but let's be strict if requested.
             # User said: "Backend acts as customs... accepts JSON... verifies it respects schema"
             # So yes, strict.
             raise HTTPException(status_code=422, detail=f"Resulting slides.json would be invalid: {str(validation_err)}")

        # 4. Save back to disk
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        logger.info(f"Updated cards for pack {pack_id}: {len(cards)} cards added/replaced.")
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Failed to update cards: {e}", exc_info=True)
        db.close()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
        
    db.close()
    return {"message": "Cards updated successfully", "count": len(cards)}

@app.delete("/slidepacks/{pack_id}")
def delete_slidepack(pack_id: int):
    db = SessionLocal()
    pack = db.query(SlidePack).filter(SlidePack.id == pack_id).first()
    if not pack:
        db.close()
        raise HTTPException(status_code=404, detail="SlidePack not found")
    
    # Delete files
    if pack.file_path and os.path.exists(pack.file_path):
        try:
            shutil.rmtree(pack.file_path)
        except Exception as e:
            logger.warning(f"Failed to delete pack folder {pack.file_path}: {e}")
            
    db.delete(pack)
    db.commit()
    db.close()
    return {"message": "SlidePack deleted"}

@app.post("/slidepacks/merge")
def merge_slidepacks(request: MergeRequest):
    """
    Merge multiple slidepacks into one.
    - Concatenates slides.
    - Concatenates audio.
    - Creates new SlidePack entry.
    """
    if len(request.pack_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 packs to merge")
        
    db = SessionLocal()
    packs = []
    for pid in request.pack_ids:
        p = db.query(SlidePack).filter(SlidePack.id == pid).first()
        if not p or p.status != 'completed':
            db.close()
            raise HTTPException(status_code=400, detail=f"Pack {pid} invalid or not completed")
        packs.append(p)
        
    # Assume all packs must belong to the same course? Or allow cross-course merge?
    # Let's put the result in the course of the first pack.
    target_course_id = packs[0].course_id
    
    # Create new logical pack
    new_pack = SlidePack(title=request.title, status="processing", course_id=target_course_id)
    db.add(new_pack)
    db.commit()
    db.refresh(new_pack)
    
    try:
        # Prepare merged data
        merged_slides = []
        combined_audio = AudioSegment.empty()
        
        current_time_offset = 0.0
        
        output_dir = f"storage/courses/{target_course_id}/{new_pack.id}"
        os.makedirs(output_dir, exist_ok=True)
        
        import json
        
        for p in packs:
            # 1. Load JSON
            json_path = os.path.join(p.file_path, "slides.json")
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # 2. Load Audio
            # Find audio file
            audio_file = None
            for f in os.listdir(p.file_path):
                if f.startswith("audio."):
                    audio_file = f
                    break
            if not audio_file:
                raise Exception(f"Audio missing for pack {p.id}")
                
            audio_path = os.path.join(p.file_path, audio_file)
            segment = AudioSegment.from_file(audio_path)
            duration_sec = len(segment) / 1000.0
            
            # 3. Adjust timestamps and append slides
            for slide in data['slides']:
                slide['timestamp_start'] += current_time_offset
                slide['timestamp_end'] += current_time_offset
                merged_slides.append(slide)
                
            # 4. Append Audio
            combined_audio += segment
            current_time_offset += duration_sec
            
        # Save merged JSON
        final_presentation = {
            "metadata": {
                "title": request.title,
                "duration": current_time_offset
            },
            "slides": merged_slides
        }
        
        with open(f"{output_dir}/slides.json", "w", encoding='utf-8') as f:
            json.dump(final_presentation, f, indent=2)
            
        # Save merged Audio
        # We'll save as mp3 by default
        final_audio_path = f"{output_dir}/audio.mp3"
        combined_audio.export(final_audio_path, format="mp3")
        
        # Complete
        new_pack.status = 'completed'
        new_pack.file_path = output_dir
        db.commit()
        
        result = {"message": "Merge successful", "new_pack_id": new_pack.id}
        
    except Exception as e:
        logger.error(f"Merge failed: {e}", exc_info=True)
        new_pack.status = 'failed'
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()
        
    return result

@app.get("/jobs/pending")
def get_pending_jobs():
    """Returns list of processing jobs."""
    db = SessionLocal()
    jobs = db.query(SlidePack).filter(SlidePack.status == "processing").all()
    
    result = []
    for job in jobs:
        result.append({
            "id": job.id,
            "title": job.title,
            "status": job.status,
            "created_at": job.created_at.isoformat() if job.created_at else None
        })
    
    db.close()
    return {"jobs": result}


# --- FRONTEND SERVING (SPA) ---
# Must be at the end to avoid capturing API routes

# --- FRONTEND SERVING (SPA) ---

import sys

# Logica robusta per trovare i percorsi sia in Dev che in EXE (PyInstaller v5 e v6+)
if getattr(sys, 'frozen', False):
    # Se siamo in un eseguibile (frozen)
    base_exe_dir = os.path.dirname(sys.executable)
    
    # 1. Cerca 'client' accanto all'exe
    path_1 = os.path.join(base_exe_dir, "client")
    # 2. Cerca 'client' dentro '_internal' (Nuovo standard PyInstaller)
    path_2 = os.path.join(base_exe_dir, "_internal", "client")
    
    if os.path.exists(path_1):
        CLIENT_DIR = path_1
    elif os.path.exists(path_2):
        CLIENT_DIR = path_2
    else:
        # Fallback: settalo comunque al path_1 per far vedere l'errore giusto nel log
        CLIENT_DIR = path_1
else:
    # Se siamo in sviluppo (python main.py)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    CLIENT_DIR = os.path.join(BASE_DIR, "client")

# If client dir exists, mount assets and serve SPA
if os.path.exists(CLIENT_DIR):
    logger.info(f"Serving frontend from {CLIENT_DIR}")
    
    assets_path = os.path.join(CLIENT_DIR, "assets")
    assets_path = os.path.join(CLIENT_DIR, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    @app.get("/")
    async def serve_index():
        index_path = os.path.join(CLIENT_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return HTTPException(status_code=404, detail="Index not found")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(CLIENT_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        index_path = os.path.join(CLIENT_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return HTTPException(status_code=404, detail="Frontend file not found")
else:
    logger.warning(f"Client directory not found at: {CLIENT_DIR}. Frontend will not be served.")

if __name__ == "__main__":
    import uvicorn
    import webbrowser
    from threading import Timer

    def open_browser():
        webbrowser.open("http://127.0.0.1:8000")

    # Schedule browser open slightly after server start
    Timer(1.5, open_browser).start()
    
    # Use 0.0.0.0 to be accessible, though localhost is fine too.
    uvicorn.run(app, host="127.0.0.1", port=8000)

