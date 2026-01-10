import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, RotateCcw, Lightbulb, Check, AlertCircle } from 'lucide-react';
import { Card, StandardCard, QuizCard } from '../types';
import { cn } from '../lib/utils'; // Assuming this exists as seen in SlideViewer

interface FlashcardPlayerProps {
    isOpen: boolean;
    onClose: () => void;
    cards: Card[];
}

export const FlashcardPlayer: React.FC<FlashcardPlayerProps> = ({
    isOpen,
    onClose,
    cards
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false); // For Standard
    const [quizSelection, setQuizSelection] = useState<number | null>(null); // For Quiz
    const [showHint, setShowHint] = useState(false);

    // Reset state on navigation
    useEffect(() => {
        setIsFlipped(false);
        setQuizSelection(null);
        setShowHint(false);
    }, [currentIndex, isOpen]);

    if (!isOpen || cards.length === 0) return null;

    const currentCard = cards[currentIndex];
    const isStandard = currentCard.type === 'standard';
    const isQuiz = currentCard.type === 'quiz';

    const handleNext = () => {
        if (currentIndex < cards.length - 1) setCurrentIndex(c => c + 1);
    };

    const handlePrev = () => {
        if (currentIndex > 0) setCurrentIndex(c => c - 1);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight') handleNext();
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'Space' || e.key === 'Enter') {
            if (isStandard) setIsFlipped(f => !f);
        }
        if (e.key === 'Escape') onClose();
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, isStandard]);

    // --- RENDERERS ---

    const renderStandard = (card: StandardCard) => (
        <div
            className="relative w-full h-[400px] perspective-1000 cursor-pointer group"
            onClick={() => setIsFlipped(!isFlipped)}
        >
            <div className={cn(
                "relative w-full h-full transition-all duration-500 transform-style-3d shadow-xl rounded-2xl bg-white",
                isFlipped ? "rotate-y-180" : ""
            )}>
                {/* FRONT */}
                <div className="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border-2 border-neutral-100">
                    <span className="absolute top-6 left-6 text-xs font-bold uppercase tracking-wider text-blue-500 bg-blue-50 px-3 py-1 rounded-full">
                        Flashcard
                    </span>
                    <h3 className="text-2xl md:text-3xl font-medium text-neutral-800 leading-relaxed">
                        {card.question}
                    </h3>

                    {card.hint && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowHint(!showHint); }}
                            className="absolute bottom-6 right-6 p-2 text-neutral-400 hover:text-yellow-500 transition"
                            title="Show Hint"
                        >
                            <Lightbulb className={cn("w-6 h-6", showHint && "fill-current text-yellow-500")} />
                        </button>
                    )}
                    {showHint && card.hint && (
                        <div className="absolute bottom-16 left-8 right-8 bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
                            💡 {card.hint}
                        </div>
                    )}
                    <span className="absolute bottom-6 text-sm text-neutral-400 font-medium">Click to flip</span>
                </div>

                {/* BACK */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 flex flex-col items-center justify-center p-8 text-center bg-blue-600 text-white rounded-2xl">
                    <span className="absolute top-6 left-6 text-xs font-bold uppercase tracking-wider text-white/80 bg-white/20 px-3 py-1 rounded-full">
                        Answer
                    </span>
                    <p className="text-xl md:text-2xl font-medium leading-relaxed">
                        {card.answer}
                    </p>
                </div>
            </div>
        </div>
    );

    const renderQuiz = (card: QuizCard) => {
        const hasAnswered = quizSelection !== null;
        const isCorrect = hasAnswered && quizSelection === card.correct_index;

        return (
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border-2 border-neutral-100 overflow-hidden flex flex-col">
                {/* Header / Question */}
                <div className="p-8 pb-4">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-purple-500 bg-purple-50 px-3 py-1 rounded-full">
                            Quiz
                        </span>
                    </div>
                    <h3 className="text-2xl font-medium text-neutral-800 leading-relaxed mb-6">
                        {card.question}
                    </h3>

                    {/* Options */}
                    <div className="space-y-3">
                        {card.options.map((option, idx) => {
                            let stateClass = "border-neutral-200 hover:border-blue-400 hover:bg-neutral-50";
                            let icon = null;

                            if (hasAnswered) {
                                if (idx === card.correct_index) {
                                    stateClass = "border-green-500 bg-green-50 text-green-800 font-medium ring-1 ring-green-500";
                                    icon = <Check className="w-5 h-5 text-green-600" />;
                                } else if (idx === quizSelection) {
                                    stateClass = "border-red-500 bg-red-50 text-red-800 ring-1 ring-red-500";
                                    icon = <AlertCircle className="w-5 h-5 text-red-600" />;
                                } else {
                                    stateClass = "border-neutral-100 opacity-50";
                                }
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => !hasAnswered && setQuizSelection(idx)}
                                    disabled={hasAnswered}
                                    className={cn(
                                        "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between group",
                                        stateClass
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={cn(
                                            "w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border",
                                            hasAnswered && idx === card.correct_index ? "bg-green-200 border-green-300 text-green-800" :
                                                hasAnswered && idx === quizSelection ? "bg-red-200 border-red-300 text-red-800" :
                                                    "bg-neutral-100 border-neutral-200 text-neutral-500 group-hover:bg-white"
                                        )}>
                                            {String.fromCharCode(65 + idx)}
                                        </span>
                                        <span>{option}</span>
                                    </div>
                                    {icon}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Explanation Footer */}
                {hasAnswered && (
                    <div className={cn(
                        "p-6 border-t animate-in slide-in-from-bottom-2",
                        isCorrect ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"
                    )}>
                        <h4 className={cn(
                            "font-bold mb-1 flex items-center gap-2",
                            isCorrect ? "text-green-800" : "text-red-800"
                        )}>
                            {isCorrect ? "Correct!" : "Incorrect"}
                        </h4>
                        <p className={cn(
                            "text-sm",
                            isCorrect ? "text-green-700" : "text-red-700"
                        )}>
                            {card.explanation || (isCorrect ? "Great job!" : "The correct answer was highlighted.")}
                        </p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] bg-neutral-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4">

            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center text-white">
                <div className="flex items-center gap-2 text-white/50">
                    <RotateCcw className="w-4 h-4" />
                    <span className="text-sm font-medium tracking-wide">LEARNING MODE</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-full transition text-white"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Main Content Area */}
            <div className="w-full max-w-3xl flex-grow flex items-center justify-center">
                {isStandard ? renderStandard(currentCard as StandardCard) : renderQuiz(currentCard as QuizCard)}
            </div>

            {/* Controls Bar */}
            <div className="w-full max-w-xl flex items-center justify-between gap-4 p-6">
                <button
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className="p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 text-white/80 font-mono text-sm">
                    {currentIndex + 1} / {cards.length}
                </div>

                <button
                    onClick={handleNext}
                    disabled={currentIndex === cards.length - 1}
                    className="p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};
