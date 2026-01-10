from typing import List, Optional, Union
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


class StandardCard(BaseModel):
    id: str
    type: str = "standard"
    question: str
    hint: Optional[str] = None
    answer: str

class QuizCard(BaseModel):
    id: str
    type: str = "quiz"
    question: str
    options: List[str]
    correct_index: int
    explanation: Optional[str] = None

class PresentationManifest(BaseModel):
    metadata: PresentationMetadata
    slides: List[Slide]
    cards: List[Union[StandardCard, QuizCard]] = []
