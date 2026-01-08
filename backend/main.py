import shutil
import os
import logging
import zipfile
import uuid
from typing import Optional, List

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

# --- BATCH & DATABASE LOGIC ---

from typing import List
from fastapi import BackgroundTasks
from database import SessionLocal, init_db, Course, SlidePack
from pydantic import BaseModel

from datetime import datetime

# Init DB on module load
init_db()

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
async def upload_batch(
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
                "created_at": p.created_at
            })
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
            # Struttura: Export/Lezione1/, Export/Lezione2/
            dest_name = pack.title.replace(" ", "_").replace("/", "-") # Sanitize basics
            shutil.copytree(pack.file_path, f"{base_dir}/{dest_name}")
            has_content = True

    if not has_content:
        db.close()
        return {"error": "No completed slidepacks to export"}

    # Zippa tutto
    zip_filename = f"course_{course_id}"
    shutil.make_archive(f"temp/{zip_filename}", 'zip', base_dir)
    
    # Cleanup folder
    shutil.rmtree(base_dir)
    db.close()
    
    return FileResponse(f"temp/{zip_filename}.zip", filename=f"{course.title}.zip")


# New: Mount storage for serving persisted files
os.makedirs("storage", exist_ok=True)
app.mount("/storage", StaticFiles(directory="storage"), name="storage")

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
    return {"message": "Course renamed", "course": course}

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
    
    # Also update the internal JSON if it exists? 
    # Good practice to keep them in sync, but maybe expansive. 
    # Let's just update DB for now, user sees DB title.
    
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
    db.commit()
    db.close()
    return {"message": "SlidePack moved"}

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
    """Returns count of processing jobs."""
    db = SessionLocal()
    count = db.query(SlidePack).filter(SlidePack.status == "processing").count()
    db.close()
    return {"pending_count": count}
