import os
import json
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from mistralai import Mistral
from models import PresentationManifest
from services.chunking import ChunkingService

# Configuration for robust calls
MAX_CONCURRENT_REQUESTS = 5
semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

class LLMService:
    def __init__(self):
        # Using Mistral Client
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
             print("Warning: MISTRAL_API_KEY is not set.")
        self.client = Mistral(api_key=api_key)
        self.chunk_duration = 120  # secondi per chunk (più grande = meno slide)

    def _chunk_segments(self, segments: list, chunk_duration: float = 60.0) -> list:
        """Divide i segmenti audio in chunk temporali."""
        if not segments:
            return []
        
        chunks = []
        current_chunk = []
        chunk_start = segments[0]['start']
        
        for segment in segments:
            if segment['start'] - chunk_start >= chunk_duration and current_chunk:
                chunks.append(current_chunk)
                current_chunk = [segment]
                chunk_start = segment['start']
            else:
                current_chunk.append(segment)
        
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks

    def _get_system_prompt(self, is_partial: bool = False) -> str:
        base_prompt = """
        Sei un esperto generatore di presentazioni educative. Il tuo compito è creare slide sincronizzate con l'audio.
        
        RICEVI IN INPUT:
        1. Un testo Markdown (materiale didattico di SUPPORTO)
        2. Una lista di segmenti audio trascritti con timestamp precisi
        
        PRINCIPIO GUIDA: L'AUDIO È LA FONTE PRIMARIA. Il markdown serve solo come supporto per formule e dettagli tecnici.
        
        DEVI GENERARE UN JSON con la seguente struttura:
        {
          "slides": [
            {
              "id": numero_progressivo,
              "timestamp_start": inizio_in_secondi,
              "timestamp_end": fine_in_secondi,
              "title": "Titolo slide in italiano",
              "content": ["Punto 1", "Punto 2", "Punto 3"],
              "math_formulas": ["formula LaTeX se presente"],
              "deep_dive": "Approfondimento opzionale"
            }
          ]
        }
        
        REGOLE FONDAMENTALI:
        
        1. LINGUA: Tutto il contenuto DEVE essere in ITALIANO.
        
        2. POCHE SLIDE, PIÙ CONTENUTO: 
           - Crea UNA slide ogni 90-120 SECONDI di audio (NON ogni 30 secondi!)
           - Accorpa concetti correlati nella STESSA slide
           - Meglio 3-4 bullet point densi che 10 slide sparse
           - Se il relatore parla di un argomento per 2 minuti, è UNA SOLA SLIDE
        
        3. SEGUI L'AUDIO, NON IL MARKDOWN:
           - I bullet point devono riflettere ciò che il relatore DICE, non tutto ciò che è nel markdown
           - NON aggiungere informazioni dal markdown che il relatore non menziona
           - Il markdown serve SOLO per: formule corrette, nomi tecnici precisi, dettagli specifici
        
        4. TIMESTAMP - REGOLA CRITICA:
           - USA SOLO i timestamp ESATTI forniti nei segmenti di trascrizione
           - NON inventare, stimare o arrotondare i timestamp
           - timestamp_start = il valore "start" del PRIMO segmento che copre l'argomento della slide
           - timestamp_end = il valore "end" dell'ULTIMO segmento coperto dalla slide
           - Esempio: se una slide copre i segmenti [45.20s-48.50s], [48.50s-52.30s], [52.30s-56.10s]
             allora timestamp_start=45.20 e timestamp_end=56.10
           - I timestamp DEVONO corrispondere a segmenti reali, non a valori inventati
        
        5. CONTENT (bullet point):
           - Massimo 4 bullet point per slide
           - Sintetizza ciò che viene DETTO nell'audio
           - Se ci sono formule inline, usa $formula$
        
        6. MATH_FORMULAS: 
           - Estrai le formule dal markdown SOLO SE il relatore le menziona
           - Usa sintassi LaTeX valida (es: $$E=mc^2$$)
        
        7. DEEP_DIVE:
           - Solo se l'audio aggiunge spiegazioni extra rispetto al testo base
           - Max 1-2 frasi
        
        8. OBIETTIVO: Chi guarda le slide mentre ascolta deve avere un SUPPORTO VISIVO, non una trascrizione completa. 
           Le slide devono aiutare a seguire, NON sostituire l'audio.
        """
        
        if is_partial:
            base_prompt += """
        
        NOTA: Stai elaborando un CHUNK PARZIALE della trascrizione. 
        Non includere metadata, genera solo le slide per questo segmento temporale.
        Gli ID delle slide possono partire da 1, verranno rinumerati successivamente.
        """
        
        return base_prompt

    @retry(
        stop=stop_after_attempt(5), 
        wait=wait_exponential(multiplier=1, min=2, max=60),
        retry=retry_if_exception_type(Exception)
    )
    async def _process_chunk_async(self, chunk_segments: list, markdown_text: str, chunk_index: int) -> list:
        """Elabora un singolo chunk in modo asincrono con retry e semaphore."""
        async with semaphore:
            print(f"Generating slides for chunk {chunk_index + 1}...")
            segments_str = "\n".join([f"[{s['start']:.2f}s - {s['end']:.2f}s] {s['text']}" for s in chunk_segments])
            
            user_message = f"""
            === MATERIALE MARKDOWN (fonte principale) ===
            {markdown_text}
            
            === TRASCRIZIONE AUDIO CON TIMESTAMP (Chunk {chunk_index + 1}) ===
            {segments_str}
            
            Genera le slide per questo segmento in italiano seguendo TUTTE le regole indicate.
            """
            
            # Usa il client async di Mistral
            response = await self.client.chat.complete_async(
                model="mistral-large-latest",
                messages=[
                    {"role": "system", "content": self._get_system_prompt(is_partial=True)},
                    {"role": "user", "content": user_message}
                ],
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            data = json.loads(content)
            
            return data.get("slides", [])

    async def _generate_title_async(self, markdown_text: str, total_duration: float) -> dict:
        """Genera i metadata della presentazione."""
        response = await self.client.chat.complete_async(
            model="mistral-large-latest",
            messages=[
                {"role": "system", "content": "Sei un assistente. Genera un JSON con i metadata della presentazione."},
                {"role": "user", "content": f"""
                Basandoti su questo materiale markdown, genera un titolo appropriato per la presentazione.
                Rispondi SOLO con un JSON nel formato: {{"title": "titolo in italiano"}}
                
                Markdown:
                {markdown_text[:2000]}
                """}
            ],
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        data = json.loads(content)
        
        return {
            "title": data.get("title", "Presentazione"),
            "duration": total_duration
        }

    async def generate_slides_async(self, markdown_text: str, transcription_segments: list) -> PresentationManifest:
        """Genera le slide in parallelo per ogni chunk di audio."""
        
        # Dividi i segmenti in chunk
        segment_chunks = self._chunk_segments(transcription_segments, self.chunk_duration)
        
        if not segment_chunks:
            # Fallback se non ci sono segmenti
            return PresentationManifest(
                metadata={"title": "Presentazione Vuota", "duration": 0},
                slides=[]
            )
        
        print(f"[LLM] Elaborazione in parallelo di {len(segment_chunks)} chunk...")
        
        # Calcola durata totale
        total_duration = transcription_segments[-1]['end'] if transcription_segments else 0
        
        # Esegui tutte le chiamate in parallelo
        tasks = [
            self._process_chunk_async(chunk, markdown_text, idx) 
            for idx, chunk in enumerate(segment_chunks)
        ]
        tasks.append(self._generate_title_async(markdown_text, total_duration))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Separa i risultati
        metadata = results[-1] if not isinstance(results[-1], Exception) else {"title": "Presentazione", "duration": total_duration}
        chunk_results = results[:-1]
        
        # Unisci tutte le slide e rinumera gli ID
        all_slides = []
        slide_id = 1
        
        for result in chunk_results:
            if isinstance(result, Exception):
                print(f"[LLM] Errore in un chunk: {result}")
                continue
            
            for slide in result:
                slide['id'] = slide_id
                all_slides.append(slide)
                slide_id += 1
        
        # Ordina le slide per timestamp
        all_slides.sort(key=lambda s: s.get('timestamp_start', 0))
        
        # Rinumera dopo l'ordinamento
        for idx, slide in enumerate(all_slides):
            slide['id'] = idx + 1
        
        print(f"[LLM] Generazione completata: {len(all_slides)} slide totali")
        
        return PresentationManifest(
            metadata=metadata,
            slides=all_slides
        )

    def generate_slides(self, markdown_text: str, transcription_segments: list) -> PresentationManifest:
        """Wrapper sincrono per compatibilità con il codice esistente."""
        return asyncio.run(self.generate_slides_async(markdown_text, transcription_segments))
