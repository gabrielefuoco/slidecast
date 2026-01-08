"""
Servizio di sincronizzazione slide-audio.
Allinea i timestamp delle slide importate con la trascrizione audio effettiva.
"""

import json
from typing import List, Dict, Any
from models import PresentationManifest, Slide, PresentationMetadata


class SyncService:
    def __init__(self):
        self.similarity_threshold = 0.3  # Soglia minima di similarità

    def load_json(self, json_path: str) -> PresentationManifest:
        """Carica una presentazione da file JSON."""
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return PresentationManifest(**data)

    def load_json_from_content(self, json_content: str) -> PresentationManifest:
        """Carica una presentazione da stringa JSON."""
        data = json.loads(json_content)
        return PresentationManifest(**data)

    def _extract_keywords(self, text: str) -> set:
        """Estrae parole chiave da un testo, rimuovendo stop words."""
        stop_words = {
            'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
            'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
            'che', 'e', 'è', 'sono', 'come', 'questo', 'questa', 'questi',
            'quello', 'quella', 'quelli', 'quelle', 'del', 'della', 'dei',
            'delle', 'al', 'alla', 'ai', 'alle', 'dal', 'dalla', 'nel',
            'nella', 'sul', 'sulla', 'si', 'ci', 'ne', 'lo', 'la', 'li',
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'could', 'should', 'may', 'might', 'must', 'shall'
        }
        
        words = text.lower().split()
        # Rimuovi punteggiatura e stop words
        clean_words = set()
        for word in words:
            clean_word = ''.join(c for c in word if c.isalnum())
            if clean_word and len(clean_word) > 2 and clean_word not in stop_words:
                clean_words.add(clean_word)
        
        return clean_words

    def _calculate_similarity(self, slide: Slide, transcript_segment: str) -> float:
        """Calcola la similarità tra il contenuto di una slide e un segmento di trascrizione."""
        # Combina titolo e contenuto della slide
        slide_text = slide.title + " " + " ".join(slide.content)
        if slide.deep_dive:
            slide_text += " " + slide.deep_dive
        
        slide_keywords = self._extract_keywords(slide_text)
        transcript_keywords = self._extract_keywords(transcript_segment)
        
        if not slide_keywords or not transcript_keywords:
            return 0.0
        
        # Calcola Jaccard similarity
        intersection = len(slide_keywords & transcript_keywords)
        union = len(slide_keywords | transcript_keywords)
        
        return intersection / union if union > 0 else 0.0

    def sync_with_audio(
        self, 
        presentation: PresentationManifest, 
        transcription_segments: List[Dict[str, Any]]
    ) -> PresentationManifest:
        """
        Sincronizza i timestamp delle slide con la trascrizione audio.
        
        Algoritmo:
        1. Per ogni slide, trova il segmento audio con la più alta similarità
        2. Usa il timestamp di quel segmento come nuovo timestamp_start
        3. Mantiene l'ordine originale delle slide
        """
        if not transcription_segments:
            print("[SYNC] Nessun segmento audio, mantengo i timestamp originali")
            return presentation
        
        print(f"[SYNC] Sincronizzazione di {len(presentation.slides)} slide con {len(transcription_segments)} segmenti audio")
        
        synced_slides = []
        used_segment_indices = set()
        
        # Prepara i segmenti per la ricerca
        segment_texts = []
        for seg in transcription_segments:
            segment_texts.append({
                'text': seg['text'],
                'start': seg['start'],
                'end': seg['end']
            })
        
        for slide_idx, slide in enumerate(presentation.slides):
            best_match_idx = None
            best_similarity = 0.0
            
            # Cerca nel range appropriato di segmenti
            # (una slide non dovrebbe "saltare" troppo indietro)
            search_start = max(0, slide_idx - 2)
            
            for seg_idx in range(search_start, len(segment_texts)):
                if seg_idx in used_segment_indices:
                    continue
                
                similarity = self._calculate_similarity(slide, segment_texts[seg_idx]['text'])
                
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match_idx = seg_idx
            
            # Assegna il timestamp
            if best_match_idx is not None and best_similarity >= self.similarity_threshold:
                new_start = segment_texts[best_match_idx]['start']
                used_segment_indices.add(best_match_idx)
                
                # Trova la fine: o il prossimo match o basato sulla durata originale
                duration = slide.timestamp_end - slide.timestamp_start
                new_end = new_start + duration
                
                print(f"[SYNC] Slide {slide.id} '{slide.title[:30]}...' -> {new_start:.2f}s (sim: {best_similarity:.2f})")
            else:
                # Mantieni timestamp originale se non c'è match
                new_start = slide.timestamp_start
                new_end = slide.timestamp_end
                print(f"[SYNC] Slide {slide.id} '{slide.title[:30]}...' -> mantenuto originale (nessun match)")
            
            synced_slide = Slide(
                id=slide.id,
                timestamp_start=new_start,
                timestamp_end=new_end,
                title=slide.title,
                content=slide.content,
                math_formulas=slide.math_formulas,
                deep_dive=slide.deep_dive
            )
            synced_slides.append(synced_slide)
        
        # Aggiusta i timestamp_end in base alla slide successiva
        for i in range(len(synced_slides) - 1):
            if synced_slides[i].timestamp_end > synced_slides[i + 1].timestamp_start:
                synced_slides[i] = Slide(
                    id=synced_slides[i].id,
                    timestamp_start=synced_slides[i].timestamp_start,
                    timestamp_end=synced_slides[i + 1].timestamp_start,
                    title=synced_slides[i].title,
                    content=synced_slides[i].content,
                    math_formulas=synced_slides[i].math_formulas,
                    deep_dive=synced_slides[i].deep_dive
                )
        
        # Aggiorna la durata totale
        if synced_slides and transcription_segments:
            total_duration = transcription_segments[-1]['end']
        else:
            total_duration = presentation.metadata.duration
        
        return PresentationManifest(
            metadata=PresentationMetadata(
                title=presentation.metadata.title,
                duration=total_duration
            ),
            slides=synced_slides
        )
