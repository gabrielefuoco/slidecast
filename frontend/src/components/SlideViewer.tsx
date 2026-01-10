import React, { useEffect, useRef, useState } from 'react';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import { cn } from '../lib/utils';

// Helper to clean LaTeX formula - remove all delimiters
const cleanFormula = (formula: string): string => {
    return formula
        .replace(/^\$\$|\$\$$/g, '')  // Remove $$...$$ 
        .replace(/^\$|\$$/g, '')       // Remove $...$
        .trim();
};

// Custom Katex Renderer Component
const KatexRenderer: React.FC<{ math: string; block?: boolean; onError?: () => void }> = ({ math, block = false, onError }) => {
    const containerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            const renderMath = (formula: string, throwError: boolean) => {
                katex.render(formula, containerRef.current!, {
                    displayMode: block,
                    throwOnError: throwError,
                    errorColor: '#ef4444',
                });
            };

            try {
                // First try rendering normally, but THROW on error so we can catch and fix
                renderMath(math, true);
            } catch (error) {
                // Common fixes for LLM-generated LaTeX
                let fixedMath = math
                    .replace(/\\\\}/g, '}')     // Fix double-escaped closing brace
                    .replace(/\\\\{/g, '{')     // Fix double-escaped opening brace
                    .replace(/\\\\/g, '\\');    // Fix double backslashes for commands

                try {
                    if (fixedMath !== math) {
                        try {
                            renderMath(fixedMath, true);
                            return; // Success with fix
                        } catch (e) { /* ignore inner error */ }
                    }

                    // If we are here, fix didn't work.
                    if (onError) {
                        onError(); // Notify parent to fallback
                    } else {
                        // Fallback to displaying with error verification (letting KaTeX show the red text)
                        renderMath(math, false);
                    }
                } catch (retryError) {
                    if (onError) onError();
                    else renderMath(math, false);
                }
            }
        }
    }, [math, block, onError]);

    return <span ref={containerRef} />;
};

// Check if string looks like it *needs* math mode
const isLikelyMath = (formula: string): boolean => {
    // If it has no spaces, it's likely a variable or number (x, 123) -> Math
    if (!formula.includes(' ')) return true;

    // If it has spaces, it might be a sentence wrapped in dollars.
    // Check for specific math indicators.
    // Indication of math: backslashes (commands), super/subscripts, relations, groupings
    const mathIndicators = ['\\', '^', '_', '=', '<', '>', '{', '}'];
    return mathIndicators.some(char => formula.includes(char));
};

// Helper to render mixed content (text + inline math + markdown formatting)
const renderContent = (text: string): React.ReactNode => {
    const placeholders: string[] = [];

    // 1. Extract Math and replace with placeholders to protect them from Markdown parsing
    // We checks if it's "Likely Math" immediately. If not, we treat it as text.
    let cleanText = text.replace(/(\$\$[^\$]+\$\$|\$[^\$]+\$)/g, (match) => {
        const inner = cleanFormula(match);
        if (isLikelyMath(inner)) {
            placeholders.push(match);
            return `__MATH_${placeholders.length - 1}__`;
        } else {
            return inner; // Treat as text, strip dollars
        }
    });

    // Helper to restore math components in a string
    const restoreMath = (str: string, keyPrefix: string) => {
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

    // 2. Process Bold (**text**)
    const boldParts = cleanText.split(/(\*\*[^*]+\*\*)/g);

    return boldParts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            const content = part.slice(2, -2);
            return <strong key={`b-${i}`}>{restoreMath(content, `b-${i}`)}</strong>;
        }

        // 3. Process Italic (*text*) on non-bold parts
        // Note: This regex is simple and might match * inside math if we hadn't protected it.
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

// Smart Component that tries to guess the best way to render a formula block
const SmartFormula: React.FC<{ formula: string }> = ({ formula }) => {
    const [renderError, setRenderError] = useState(false);

    // Reset error if formula changes
    useEffect(() => {
        setRenderError(false);
    }, [formula]);

    if (renderError) {
        // Fallback: try to render as text with potential mixed content
        // We use the same renderContent logic to handle any markdown/math mix in the fallback
        let content = formula;
        const dollarCount = (content.match(/\$/g) || []).length;
        if (dollarCount % 2 !== 0) {
            if (!content.trim().startsWith('$')) content = '$' + content;
            else content = content + '$';
        }
        return <div className="text-center italic">{renderContent(content)}</div>;
    }

    return (
        <KatexRenderer
            math={cleanFormula(formula)}
            block={true}
            onError={() => setRenderError(true)}
        />
    );
};

interface Slide {
    id: number;
    timestamp_start: number;
    timestamp_end: number;
    title: string;
    content: string[];
    math_formulas: string[];
    deep_dive?: string;
}

interface SlideViewerProps {
    slides: Slide[];
    currentSlideId: number;
    onSlideClick?: (timestamp: number) => void;
}

// Individual slide card component
const SlideCard: React.FC<{
    slide: Slide;
    isActive: boolean;
    onClick?: () => void;
}> = ({ slide, isActive, onClick }) => {
    const hasFormulas = slide.math_formulas.length > 0;

    return (
        <div
            onClick={onClick}
            className={cn(
                "flex flex-col p-5 bg-white text-neutral-900 rounded-xl shadow-md transition-all cursor-pointer subpixel-antialiased",
                isActive
                    ? "shadow-xl z-10 ring-1 ring-black/5"
                    : "opacity-75 hover:opacity-95"
            )}
        >
            {/* Title */}
            <h2 className="text-lg lg:text-xl font-bold text-neutral-800 mb-3">
                {slide.title}
            </h2>

            {/* Content */}
            <ul className="space-y-2 mb-4">
                {
                    slide.content.map((point, index) => {
                        // Check if it's a sub-item (starts with -)
                        const isSubItem = point.trim().startsWith('-');

                        // Check if it's a numbered item (starts with "1.", "2.", etc.)
                        const numberMatch = point.trim().match(/^(\d+)\.\s+(.*)/);
                        const isNumbered = !!numberMatch;

                        let cleanPoint = point;
                        let itemNumber = "";

                        if (isSubItem) {
                            cleanPoint = point.trim().substring(1).trim();
                        } else if (isNumbered && numberMatch) {
                            itemNumber = numberMatch[1];
                            cleanPoint = numberMatch[2];
                        }

                        return (
                            <li
                                key={index}
                                className={cn(
                                    "flex items-start gap-3 text-base lg:text-lg leading-relaxed text-neutral-700",
                                    isSubItem && "ml-8" // Add indentation for sub-items
                                )}
                            >
                                {isNumbered ? (
                                    <span className="mt-0.5 min-w-[1.5rem] font-bold text-blue-600 flex justify-end px-1 select-none">
                                        {itemNumber}.
                                    </span>
                                ) : (
                                    <span
                                        className={cn(
                                            "mt-2 rounded-full flex-shrink-0",
                                            isSubItem
                                                ? "w-1.5 h-1.5 bg-neutral-400" // Smaller, gray dot for sub-items
                                                : "w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500" // Normal dot
                                        )}
                                    />
                                )}
                                <span>{renderContent(cleanPoint)}</span>
                            </li>
                        );
                    })
                }
            </ul>

            {/* Formulas */}
            {
                hasFormulas && (
                    <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 mb-3">
                        <div className="flex flex-wrap justify-center gap-4">
                            {slide.math_formulas.map((formula, i) => (
                                <div key={i} className="text-lg lg:text-xl overflow-x-auto w-full flex justify-center">
                                    <SmartFormula formula={formula} />
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* Deep Dive */}
            {
                slide.deep_dive && (
                    <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100">
                        <p className="text-neutral-600 text-sm leading-relaxed italic">
                            ✨ {renderContent(slide.deep_dive)}
                        </p>
                    </div>
                )
            }
        </div>
    );
};

import { CardEditor } from './CardEditor';
import { FlashcardPlayer } from './FlashcardPlayer';
import { Card } from '../types';
import { BookOpen, Edit3 } from 'lucide-react';

// ... (previous imports)

interface SlideViewerProps {
    slides: Slide[];
    cards?: Card[];
    packId?: number;
    currentSlideId: number;
    onSlideClick?: (timestamp: number) => void;
    onCardsUpdate?: (newCards: Card[]) => void;
}

// ... (SlideCard component remains same)

export const SlideViewer: React.FC<SlideViewerProps> = ({
    slides,
    cards = [],
    packId,
    currentSlideId,
    onSlideClick,
    onCardsUpdate
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const activeSlideRef = useRef<HTMLDivElement>(null);

    // Learning Objects State
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [isPlayerOpen, setIsPlayerOpen] = useState(false);

    // Auto-scroll to active slide
    useEffect(() => {
        if (activeSlideRef.current && containerRef.current) {
            activeSlideRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }, [currentSlideId]);

    // Find the index of active slide for shadow calculations
    const activeIndex = slides.findIndex(s => s.id === currentSlideId);

    return (
        <div className="relative w-full h-full">
            {/* Toolbar / Actions */}
            <div className="absolute top-4 right-6 z-40 flex items-center gap-2">
                {packId && (
                    <button
                        onClick={() => setIsEditorOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-sm font-medium text-white/80 hover:text-white transition shadow-sm border border-white/5"
                        title="Manage Learning Objects (JSON)"
                    >
                        <Edit3 className="w-4 h-4" />
                        <span>Manage Cards</span>
                    </button>
                )}
            </div>

            {/* Scroll Container */}
            <div
                ref={containerRef}
                className="flex flex-col h-full w-full gap-3 overflow-y-auto py-16 px-4 scroll-smooth items-center"
                style={{ perspective: '1200px' }}
            >
                {slides.map((slide, index) => {
                    // Calculate 3D effects based on position relative to active slide
                    const distance = index - activeIndex;

                    let wrapperStyle: React.CSSProperties = {};
                    let overlayOpacity = 0;

                    if (distance < 0) {
                        // Slides ABOVE active: push back and darken
                        const absDistance = Math.abs(distance);
                        wrapperStyle = {
                            transform: `translateZ(-${absDistance * 30}px) rotateX(3deg)`,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        };
                        overlayOpacity = Math.min(0.35, absDistance * 0.12);
                    } else if (distance === 0) {
                        // ACTIVE slide: No scaling, no Z-translation to ensure pixel-perfect rendering
                        wrapperStyle = {
                            transform: 'translateZ(0) scale(1)',
                            zIndex: 50, // Ensure it's on top
                            boxShadow: '0 30px 60px -15px rgba(0,0,0,0.5), 0 15px 30px -10px rgba(0,0,0,0.35)',
                        };
                    } else {
                        // Slides BELOW active: recede into distance
                        wrapperStyle = {
                            transform: `translateZ(-${distance * 25}px) rotateX(-2deg)`,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        };
                        overlayOpacity = Math.min(0.2, distance * 0.06);
                    }

                    return (
                        <div
                            key={slide.id}
                            ref={slide.id === currentSlideId ? activeSlideRef : null}
                            className="w-full max-w-4xl transition-all duration-500 relative rounded-xl"
                            style={{
                                ...wrapperStyle,
                                transformStyle: 'preserve-3d',
                                backfaceVisibility: 'hidden', // Improve rendering performance
                            }}
                        >
                            {/* Dark overlay for depth effect */}
                            {overlayOpacity > 0 && (
                                <div
                                    className="absolute inset-0 bg-gradient-to-b from-black/30 to-transparent rounded-xl pointer-events-none z-10 transition-opacity duration-500"
                                    style={{ opacity: overlayOpacity }}
                                />
                            )}
                            <SlideCard
                                slide={slide}
                                isActive={slide.id === currentSlideId}
                                onClick={() => onSlideClick?.(slide.timestamp_start)}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Review FAB */}
            {cards.length > 0 && (
                <button
                    onClick={() => setIsPlayerOpen(true)}
                    className="absolute bottom-8 right-8 z-50 flex items-center gap-2 pl-4 pr-5 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full shadow-lg hover:scale-105 hover:shadow-blue-500/30 transition-all font-bold group"
                >
                    <BookOpen className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                    <span>Review ({cards.length})</span>
                </button>
            )}

            {/* Modals */}
            {packId && (
                <CardEditor
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    currentCards={cards}
                    packId={packId}
                    onSaveSuccess={(newCards) => {
                        onCardsUpdate?.(newCards);
                    }}
                />
            )}

            <FlashcardPlayer
                isOpen={isPlayerOpen}
                onClose={() => setIsPlayerOpen(false)}
                cards={cards}
            />
        </div>
    );
};
