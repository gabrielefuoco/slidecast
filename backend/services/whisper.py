from faster_whisper import WhisperModel
import torch

class WhisperService:
    def __init__(self):
        cuda_available = torch.cuda.is_available()
        print(f"CUDA available: {cuda_available}")

        if cuda_available:
            print(f"CUDA device name: {torch.cuda.get_device_name(0)}")
            self.device = "cuda"
            compute_type = "float16"   # 🔥 super veloce su GPU
        else:
            print("WARNING: CUDA not available, using CPU")
            self.device = "cpu"
            compute_type = "int8"      # 🔥 veloce su CPU

        print(f"Using device: {self.device}")
        print("Loading faster-whisper model (base)...")

        self.model = WhisperModel(
            "tiny",
            device=self.device,
            compute_type=compute_type
        )

        print("Model loaded successfully")

    def transcribe(self, file_path: str):
        print(f"Transcribing {file_path} with faster-whisper...")

        segments, info = self.model.transcribe(
            file_path,
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

        print(f"Transcription complete: {len(result)} segments")
        return result
