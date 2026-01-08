import React, { useEffect, useRef } from 'react';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath as KaTeXBlockMath } from 'react-katex';
import { cn } from '../lib/utils';

// Helper to clean LaTeX formula - remove all delimiters
const cleanFormula = (formula: string): string => {
    return formula
        .replace(/^\$\$|\$\$$/g, '')  // Remove $$...$$ 
        .replace(/^\$|\$$/g, '')       // Remove $...$
        .trim();
};

// Helper to render mixed content (text + inline math + markdown formatting)
const renderContent = (text: string): React.ReactNode => {
    // First, handle math formulas
    const mathPattern = /(\$\$[^\$]+\$\$|\$[^\$]+\$)/g;
    const parts = text.split(mathPattern);

    return parts.map((part, i) => {
        // Math formulas
        if (part.startsWith('$$') && part.endsWith('$$')) {
            return <InlineMath key={i} math={cleanFormula(part)} />;
        }
        if (part.startsWith('$') && part.endsWith('$')) {
            return <InlineMath key={i} math={cleanFormula(part)} />;
        }

        // For non-math parts, handle bold and italic
        // Replace **text** with bold and *text* with italic
        const formattedPart = part
            .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
            .map((segment, j) => {
                if (segment.startsWith('**') && segment.endsWith('**')) {
                    return <strong key={`${i}-${j}`}>{segment.slice(2, -2)}</strong>;
                }
                if (segment.startsWith('*') && segment.endsWith('*')) {
                    return <em key={`${i}-${j}`}>{segment.slice(1, -1)}</em>;
                }
                return segment;
            });

        return <span key={i}>{formattedPart}</span>;
    });
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
            < h2 className="text-lg lg:text-xl font-bold text-neutral-800 mb-3" >
                {slide.title}
            </h2 >

            {/* Content */}
            < ul className="space-y-2 mb-4" >
                {
                    slide.content.map((point, index) => (
                        <li key={index} className="flex items-start gap-3 text-base lg:text-lg leading-relaxed text-neutral-700">
                            <span className="w-2 h-2 mt-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex-shrink-0" />
                            <span>{renderContent(point)}</span>
                        </li>
                    ))
                }
            </ul >

            {/* Formulas */}
            {
                hasFormulas && (
                    <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 mb-3">
                        <div className="flex flex-wrap justify-center gap-4">
                            {slide.math_formulas.map((formula, i) => (
                                <div key={i} className="text-lg lg:text-xl overflow-x-auto">
                                    <KaTeXBlockMath math={cleanFormula(formula)} />
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
                            ✨ {slide.deep_dive}
                        </p>
                    </div>
                )
            }
        </div >
    );
};

export const SlideViewer: React.FC<SlideViewerProps> = ({ slides, currentSlideId, onSlideClick }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const activeSlideRef = useRef<HTMLDivElement>(null);

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
        <div
            ref={containerRef}
            className="flex flex-col h-full w-full gap-3 overflow-y-auto py-4 px-4 scroll-smooth items-center"
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
    );
};


