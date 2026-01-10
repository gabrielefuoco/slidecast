import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, RotateCcw, Check, XCircle, Lightbulb, ArrowRight } from 'lucide-react';
import { Card, StandardCard, QuizCard } from '../types';
import 'katex/dist/katex.min.css';
import katex from 'katex';

// ============ MARKDOWN & LATEX RENDERING HELPERS ============

const cleanFormula = (formula: string): string => {
    return formula
        .replace(/^\$\$|\$\$$/g, '')
        .replace(/^\$|\$$/g, '')
        .trim();
};

const KatexRenderer: React.FC<{ math: string; block?: boolean }> = ({ math, block = false }) => {
    const containerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            try {
                katex.render(math, containerRef.current, {
                    displayMode: block,
                    throwOnError: false,
                    errorColor: '#ef4444',
                });
            } catch (error) {
                if (containerRef.current) {
                    containerRef.current.textContent = math;
                }
            }
        }
    }, [math, block]);

    return <span ref={containerRef} />;
};

const isLikelyMath = (formula: string): boolean => {
    if (!formula.includes(' ')) return true;
    const mathIndicators = ['\\', '^', '_', '=', '<', '>', '{', '}', '\\frac', '\\sum', '\\int'];
    return mathIndicators.some(char => formula.includes(char));
};

const renderContent = (text: string): React.ReactNode => {
    if (!text) return null;

    const placeholders: string[] = [];

    let cleanText = text.replace(/(\$\$[^\$]+\$\$|\$[^\$]+\$)/g, (match) => {
        const inner = cleanFormula(match);
        if (isLikelyMath(inner)) {
            placeholders.push(match);
            return `__MATH_${placeholders.length - 1}__`;
        } else {
            return inner;
        }
    });

    const restoreMath = (str: string, keyPrefix: string): React.ReactNode => {
        if (!str.includes('__MATH_')) return str;

        const parts = str.split(/(__MATH_\d+__)/g);
        return parts.map((part, i) => {
            const match = part.match(/__MATH_(\d+)__/);
            if (match) {
                const index = parseInt(match[1]);
                const formula = placeholders[index];
                const isBlock = formula.startsWith('$$');
                return <KatexRenderer key={`${keyPrefix}-${i}`} math={cleanFormula(formula)} block={isBlock} />;
            }
            return part;
        });
    };

    const boldParts = cleanText.split(/(\*\*[^*]+\*\*)/g);

    return boldParts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            const content = part.slice(2, -2);
            return <strong key={`b-${i}`}>{restoreMath(content, `b-${i}`)}</strong>;
        }

        const italicParts = part.split(/(\*[^*]+\*)/g);
        return (
            <span key={`s-${i}`}>
                {italicParts.map((subPart, j) => {
                    if (subPart.startsWith('*') && subPart.endsWith('*')) {
                        const content = subPart.slice(1, -1);
                        return <em key={`i-${i}-${j}`}>{restoreMath(content, `i-${i}-${j}`)}</em>;
                    }
                    return <span key={`t-${i}-${j}`}>{restoreMath(subPart, `t-${i}-${j}`)}</span>;
                })}
            </span>
        );
    });
};

// ============ FLASHCARD PLAYER COMPONENT ============

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
    const [isFlipped, setIsFlipped] = useState(false);
    const [quizSelection, setQuizSelection] = useState<number | null>(null);
    const [showHint, setShowHint] = useState(false);
    const resultRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setIsFlipped(false);
        setQuizSelection(null);
        setShowHint(false);
    }, [currentIndex, isOpen]);

    useEffect(() => {
        if (isOpen) setCurrentIndex(0);
    }, [isOpen]);

    // Auto-scroll to result when answering
    useEffect(() => {
        if (quizSelection !== null && resultRef.current) {
            setTimeout(() => {
                resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [quizSelection]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                if (currentCard?.type === 'standard') setIsFlipped(f => !f);
            }
            if (e.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, currentIndex]);

    if (!isOpen) return null;

    if (!cards || cards.length === 0) {
        return (
            <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 text-center shadow-2xl max-w-md">
                    <div className="text-6xl mb-4">📚</div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2">Nessuna Flashcard</h2>
                    <p className="text-gray-500 mb-6">Non ci sono flashcard disponibili.</p>
                    <button onClick={onClose} className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold">
                        Chiudi
                    </button>
                </div>
            </div>
        );
    }

    const currentCard = cards[currentIndex];
    if (!currentCard) return null;

    const handleNext = () => currentIndex < cards.length - 1 && setCurrentIndex(i => i + 1);
    const handlePrev = () => currentIndex > 0 && setCurrentIndex(i => i - 1);

    // Render Standard Flashcard
    const renderStandardCard = (card: StandardCard) => (
        <div
            className="w-full h-full max-w-4xl cursor-pointer"
            onClick={() => setIsFlipped(!isFlipped)}
            style={{ perspective: '1500px' }}
        >
            <div
                className="relative w-full h-full transition-transform duration-500 ease-out"
                style={{
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                }}
            >
                {/* FRONT */}
                <div
                    className="absolute inset-0 bg-white rounded-3xl shadow-2xl flex flex-col"
                    style={{ backfaceVisibility: 'hidden' }}
                >
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-4 py-1.5 rounded-full">
                            Flashcard
                        </span>
                        {card.hint && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowHint(!showHint); }}
                                className={`p-3 rounded-xl transition-all ${showHint
                                    ? 'bg-amber-100 text-amber-600 shadow-md'
                                    : 'bg-amber-50 text-amber-500 hover:bg-amber-100 hover:text-amber-600 hover:shadow-md'
                                    }`}
                                title="Mostra suggerimento"
                            >
                                <Lightbulb className={`w-6 h-6 ${showHint ? 'fill-current' : ''}`} />
                            </button>
                        )}
                    </div>

                    <div className="flex-grow flex items-center justify-center p-8 overflow-auto">
                        <div className="text-xl md:text-2xl lg:text-3xl font-semibold text-gray-800 text-center leading-relaxed">
                            {renderContent(card.question)}
                        </div>
                    </div>

                    {showHint && card.hint && (
                        <div className="mx-6 mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">
                            💡 {renderContent(card.hint)}
                        </div>
                    )}

                    <div className="p-4 border-t border-gray-100 text-center">
                        <p className="text-sm text-gray-400">Clicca per vedere la risposta</p>
                    </div>
                </div>

                {/* BACK */}
                <div
                    className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-600 rounded-3xl shadow-2xl flex flex-col"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                    <div className="p-6 border-b border-white/20">
                        <span className="text-xs font-bold uppercase tracking-wider text-white/80 bg-white/20 px-4 py-1.5 rounded-full">
                            Risposta
                        </span>
                    </div>

                    <div className="flex-grow flex items-center justify-center p-8 overflow-auto">
                        <div className="text-xl md:text-2xl font-medium text-white text-center leading-relaxed">
                            {renderContent(card.answer)}
                        </div>
                    </div>

                    <div className="p-4 border-t border-white/20 text-center">
                        <p className="text-sm text-white/60">Clicca per tornare alla domanda</p>
                    </div>
                </div>
            </div>
        </div>
    );

    // Render Quiz Card with improved answer visualization
    const renderQuizCard = (card: QuizCard) => {
        const hasAnswered = quizSelection !== null;
        const isCorrect = hasAnswered && quizSelection === card.correct_index;
        const options = card.options || [];

        return (
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-full overflow-auto">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-3xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-100 px-4 py-1.5 rounded-full">
                        Quiz
                    </span>
                    <span className="text-sm text-gray-400 font-medium">
                        {currentIndex + 1} / {cards.length}
                    </span>
                </div>

                {/* Question */}
                <div className="p-6 md:p-8">
                    <div className="text-lg md:text-xl lg:text-2xl font-semibold text-gray-800 leading-relaxed mb-8">
                        {renderContent(card.question)}
                    </div>

                    {/* Options */}
                    <div className="space-y-3">
                        {options.map((option, idx) => {
                            const isThisCorrect = idx === card.correct_index;
                            const isThisSelected = idx === quizSelection;

                            let containerClass = 'bg-gray-50 border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:shadow-md';
                            let textClass = 'text-gray-700';
                            let letterClass = 'bg-gray-200 text-gray-600';
                            let icon = null;

                            if (hasAnswered) {
                                if (isThisCorrect) {
                                    // Correct answer - always show green
                                    containerClass = 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400 shadow-lg shadow-green-100';
                                    textClass = 'text-green-800 font-semibold';
                                    letterClass = 'bg-green-500 text-white';
                                    icon = <Check className="w-6 h-6 text-green-600" />;
                                } else if (isThisSelected) {
                                    // Wrong selection - show red
                                    containerClass = 'bg-gradient-to-r from-red-50 to-rose-50 border-red-400 shadow-lg shadow-red-100';
                                    textClass = 'text-red-800';
                                    letterClass = 'bg-red-500 text-white';
                                    icon = <XCircle className="w-6 h-6 text-red-600" />;
                                } else {
                                    // Other options - fade out
                                    containerClass = 'bg-gray-50/50 border-gray-100 opacity-40';
                                    textClass = 'text-gray-400';
                                    letterClass = 'bg-gray-200 text-gray-400';
                                }
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => !hasAnswered && setQuizSelection(idx)}
                                    disabled={hasAnswered}
                                    className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-300 flex items-start gap-4 ${containerClass} ${!hasAnswered ? 'cursor-pointer transform hover:scale-[1.01]' : 'cursor-default'}`}
                                >
                                    <span className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-bold ${letterClass} flex-shrink-0 transition-all`}>
                                        {String.fromCharCode(65 + idx)}
                                    </span>
                                    <span className={`flex-grow ${textClass} leading-relaxed text-base md:text-lg pt-1.5`}>
                                        {renderContent(option)}
                                    </span>
                                    {icon && <span className="flex-shrink-0 mt-1">{icon}</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Result Section - Enhanced */}
                {hasAnswered && (
                    <div
                        ref={resultRef}
                        className={`p-6 md:p-8 border-t-2 ${isCorrect
                            ? 'bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border-green-300'
                            : 'bg-gradient-to-br from-red-50 via-rose-50 to-orange-50 border-red-300'
                            }`}
                    >
                        {/* Result Header */}
                        <div className="flex items-center gap-4 mb-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isCorrect ? 'bg-green-500' : 'bg-red-500'
                                } shadow-lg`}>
                                {isCorrect
                                    ? <Check className="w-8 h-8 text-white" />
                                    : <XCircle className="w-8 h-8 text-white" />
                                }
                            </div>
                            <div>
                                <h3 className={`text-2xl font-bold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                                    {isCorrect ? 'Ottimo lavoro! 🎉' : 'Risposta errata'}
                                </h3>
                                <p className={`text-sm ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                                    {isCorrect ? 'Hai selezionato la risposta corretta' : 'Non preoccuparti, impara dall\'errore'}
                                </p>
                            </div>
                        </div>

                        {/* Explanation */}
                        {card.explanation && (
                            <div className="bg-white/60 rounded-xl p-5 mb-4 border border-gray-200">
                                <h4 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-2">Spiegazione</h4>
                                <p className="text-gray-700 leading-relaxed">{renderContent(card.explanation)}</p>
                            </div>
                        )}

                        {/* Show correct answer if wrong */}
                        {!isCorrect && (
                            <div className="bg-green-100/80 rounded-xl p-5 border border-green-200">
                                <h4 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Check className="w-4 h-4" />
                                    Risposta corretta
                                </h4>
                                <p className="text-green-800 font-medium text-lg">{renderContent(options[card.correct_index])}</p>
                            </div>
                        )}

                        {/* Next button */}
                        {currentIndex < cards.length - 1 && (
                            <button
                                onClick={handleNext}
                                className="mt-6 w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl"
                            >
                                Prossima domanda
                                <ArrowRight className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderCard = () => {
        try {
            if (currentCard.type === 'standard') return renderStandardCard(currentCard as StandardCard);
            if (currentCard.type === 'quiz') return renderQuizCard(currentCard as QuizCard);
            return <div className="bg-white rounded-2xl p-8 text-center"><p className="text-red-600">Tipo sconosciuto</p></div>;
        } catch (error) {
            return <div className="bg-white rounded-2xl p-8 text-center"><p className="text-red-600">Errore rendering</p></div>;
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
            {/* Compact Top Bar */}
            <div className="flex justify-between items-center px-4 py-3 md:px-6 flex-shrink-0">
                <div className="flex items-center gap-3 text-white/60">
                    <RotateCcw className="w-4 h-4" />
                    <span className="text-xs font-bold tracking-wide">STUDIO</span>
                    <span className="text-xs text-white/40">• {currentIndex + 1}/{cards.length}</span>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Card Content */}
            <div className="flex-grow flex items-center justify-center px-4 md:px-8 py-2 overflow-hidden">
                <div className="w-full h-full max-h-[calc(100vh-100px)] flex items-center justify-center">
                    {renderCard()}
                </div>
            </div>

            {/* Compact Navigation */}
            <div className="py-3 px-4 flex-shrink-0">
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white flex items-center justify-center"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    {cards.length <= 12 ? (
                        <div className="flex items-center gap-1.5">
                            {cards.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentIndex(idx)}
                                    className={`w-2.5 h-2.5 rounded-full transition-all ${idx === currentIndex ? 'bg-white scale-110' : 'bg-white/30 hover:bg-white/50'
                                        }`}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="px-3 py-1.5 rounded-full bg-white/20 text-white font-mono text-xs">
                            {currentIndex + 1} / {cards.length}
                        </div>
                    )}

                    <button
                        onClick={handleNext}
                        disabled={currentIndex === cards.length - 1}
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white flex items-center justify-center"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};
