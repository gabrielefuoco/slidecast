export type CardType = 'standard' | 'quiz';

export interface StandardCard {
    id: string;
    type: 'standard';
    question: string;
    hint?: string;
    answer: string;
}

export interface QuizCard {
    id: string;
    type: 'quiz';
    question: string;
    options: string[];
    correct_index: number;
    explanation?: string;
}

// ... previous content

export interface Slide {
    id: number;
    timestamp_start: number;
    timestamp_end: number;
    title: string;
    content: string[];
    math_formulas: string[];
    deep_dive?: string;
}

export interface PresentationMetadata {
    title: string;
    duration: number;
}

export interface PresentationData {
    metadata: PresentationMetadata;
    slides: Slide[];
    cards?: Card[];
}
