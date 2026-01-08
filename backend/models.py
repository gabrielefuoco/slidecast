from typing import List, Optional
from pydantic import BaseModel

class Slide(BaseModel):
    id: int
    timestamp_start: float
    timestamp_end: float
    title: str
    content: List[str]
    math_formulas: List[str] = []
    deep_dive: Optional[str] = None

class PresentationMetadata(BaseModel):
    title: str
    duration: float

class PresentationManifest(BaseModel):
    metadata: PresentationMetadata
    slides: List[Slide]
