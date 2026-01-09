from faster_whisper import WhisperModel
# import torch # Removing heavy dependency just for device check

class WhisperService:
    def __init__(self):
        # Naive check or just try CUDA
        # faster-whisper will throw if we try cuda and it's not there, 
        # but we can try-except or just default to auto if supported?
        # Actually simplest is to try "cuda" and fallback.
        
        self.device = "cuda"
        self.compute_type = "float16"
        
        print("Loading faster-whisper model (base)...")
        try:
            self.model = WhisperModel("tiny", device=self.device, compute_type=self.compute_type)
            print(f"Using device: {self.device} (CUDA)")
        except Exception as e:
            print(f"CUDA failed ({e}), falling back to CPU")
            self.device = "cpu"
            self.compute_type = "int8"
            self.model = WhisperModel("tiny", device=self.device, compute_type=self.compute_type)

        print("Model loaded successfully")

    def transcribe(self, file_path: str):
        print(f"Transcribing {file_path} with faster-whisper...")

        # --- NORMALIZATION STEP ---
        import os
        from pydub import AudioSegment
        
        # Temp path for normalized audio
        normalized_path = f"{file_path}_normalized.wav"
        
        try:
            print("Normalizing audio to 16kHz mono...")
            audio = AudioSegment.from_file(file_path)
            audio = audio.set_channels(1)
            audio = audio.set_frame_rate(16000)
            audio.export(normalized_path, format="wav")
            print("Normalization complete.")
            
            # Use normalized file for transcription
            transcribe_path = normalized_path
        except Exception as e:
            print(f"Normalization failed: {e}. Falling back to original file.")
            transcribe_path = file_path

        segments, info = self.model.transcribe(
            transcribe_path,
            language="it",
            initial_prompt="Questa è una lezione universitaria in italiano su argomenti di informatica e machine learning."
        )

        result = []
        for seg in segments:
            result.append({
                "start": seg.start,
                "end": seg.end,
                "text": seg.text
            })
            
        # Cleanup normalized file if it exists
        if os.path.exists(normalized_path):
            os.remove(normalized_path)

        print(f"Transcription complete: {len(result)} segments")
        return result
