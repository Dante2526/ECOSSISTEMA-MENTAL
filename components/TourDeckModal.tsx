import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Tour, OrbitalSystem } from '../types';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface TourDeckModalProps {
    isOpen: boolean;
    tour: Tour | null;
    systems: OrbitalSystem[];
    onClose: () => void;
    onSystemFocus: (systemId: string) => void;
}

export const TourDeckModal: React.FC<TourDeckModalProps> = React.memo(({ isOpen, tour, systems, onClose, onSystemFocus }) => {
    // Generate a flat list of all slides for the tour
    const slides = useMemo(() => {
        if (!tour) return [];
        const result: { imageUrl: string, systemName: string, systemId: string, globalIndex: number }[] = [];
        let globalIndex = 0;

        tour.steps.forEach(step => {
            const system = systems.find(s => s.id === step.systemId);
            if (system && system.modalUrls.length > 0) {
                system.modalUrls.forEach(url => {
                    result.push({
                        imageUrl: url,
                        systemName: system.name,
                        systemId: system.id,
                        globalIndex: globalIndex++
                    });
                });
            }
        });
        return result;
    }, [tour, systems]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRendered, setIsRendered] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    // Swipe handling state
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);

    // Initial setup when modal opens
    useEffect(() => {
        if (isOpen && slides.length > 0) {
            setIsRendered(true);
            setCurrentIndex(0);

            // Trigger focus for the first slide immediately
            onSystemFocus(slides[0].systemId);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => setIsVisible(true));
            });
        } else {
            setIsVisible(false);
            const timer = setTimeout(() => setIsRendered(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, slides, onSystemFocus]); // Do NOT include slides reference itself if not necessary, but here it's memoized

    const goToSlide = useCallback((index: number) => {
        if (index >= 0 && index < slides.length) {
            setCurrentIndex(index);
            onSystemFocus(slides[index].systemId);
        }
    }, [slides, onSystemFocus]);

    const handleNext = useCallback(() => {
        goToSlide(currentIndex + 1);
    }, [currentIndex, goToSlide]);

    const handlePrev = useCallback(() => {
        goToSlide(currentIndex - 1);
    }, [currentIndex, goToSlide]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleNext, handlePrev, onClose]);

    // Swipe handlers
    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
        touchEndX.current = null;
        touchStartX.current = e.targetTouches[0].clientX;
    };

    const onTouchMove = (e: React.TouchEvent) => {
        touchEndX.current = e.targetTouches[0].clientX;
    };

    const onTouchEnd = () => {
        if (!touchStartX.current || !touchEndX.current) return;
        const distance = touchStartX.current - touchEndX.current;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            handleNext();
        } else if (isRightSwipe) {
            handlePrev();
        }
    };

    if (!isRendered || slides.length === 0) return null;

    return (
        <div className={`fixed inset-0 z-[9999] bg-black/80 flex flex-col transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`} style={{ height: '100dvh' }}>

            {/* Top Bar for Tour Header */}
            <div className="w-full shrink-0 p-3 md:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between text-white z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                <div className="pointer-events-auto flex-1 pr-2">
                    <h2 className="text-xl md:text-2xl font-bold drop-shadow-md truncate">{tour?.name}</h2>
                    <p className="text-sm md:text-md text-gray-300 drop-shadow-md truncate">
                        {slides[currentIndex].systemName} ({currentIndex + 1} / {slides.length})
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="pointer-events-auto mt-2 sm:mt-0 whitespace-nowrap px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white text-md rounded-lg font-bold border border-red-400 backdrop-blur-sm shadow-lg transition-all"
                >
                    Sair do Tour
                </button>
            </div>

            {/* Deck Gallery Container - Ocupa o espaço restante do meio */}
            <div
                className="relative w-full flex-1 flex items-center justify-center overflow-hidden touch-pan-y"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {slides.map((slide, i) => {
                    const offset = i - currentIndex;
                    const isVisibleSlide = Math.abs(offset) <= 2; // only render/show near slides for performance

                    if (!isVisibleSlide) return null;

                    // Coverflow calc
                    const scale = 1 - Math.abs(offset) * 0.15;
                    const translateX = offset * 52; // Changed from 60 to 52 to bring side images closer
                    const zIndex = 100 - Math.abs(offset);
                    const opacity = Math.abs(offset) > 1 ? 0 : 1 - Math.abs(offset) * 0.2; // Changed from 0.3 to 0.2 for more visibility
                    const blur = Math.abs(offset) > 0 ? 'blur(2px)' : 'none'; // Reduced blur from 4px to 2px

                    const imageEl = (
                        <img
                            src={slide.imageUrl}
                            alt={slide.systemName}
                            className={`w-auto h-auto max-w-[90vw] max-h-[100%] object-contain rounded-xl border border-white/20 shadow-2xl block ${offset === 0 ? '' : 'pointer-events-none'}`}
                            draggable={false}
                            decoding="async"
                        />
                    );

                    return (
                        <div
                            key={`slide-${i}`}
                            className="absolute inset-0 flex items-center justify-center transition-all duration-500 ease-out"
                            style={{
                                transform: `translateX(${translateX}%) scale(${scale}) translateZ(0)`,
                                zIndex,
                                opacity,
                                filter: blur,
                                pointerEvents: offset === 0 ? 'auto' : 'none',
                                willChange: 'transform, opacity, filter'
                            }}
                        >
                            {offset === 0 ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <TransformWrapper
                                        key={`transform-tour-${currentIndex}`}
                                        initialScale={1}
                                        minScale={0.5}
                                        maxScale={8}
                                        centerOnInit={true}
                                        wheel={{ smoothStep: 0.01 }}
                                    >
                                        <TransformComponent>
                                            {imageEl}
                                        </TransformComponent>
                                    </TransformWrapper>
                                </div>
                            ) : (
                                imageEl
                            )}

                            {/* Clickable side-zones for next/prev when visible on desktop */}
                            {offset === -1 && (
                                <div className="absolute inset-0 cursor-pointer pointer-events-auto" onClick={handlePrev} />
                            )}
                            {offset === 1 && (
                                <div className="absolute inset-0 cursor-pointer pointer-events-auto" onClick={handleNext} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Navigation Buttons (Bottom Bar / Footer) */}
            <div className="w-full shrink-0 flex justify-center items-center gap-12 md:gap-24 p-4 md:p-8 z-50 pointer-events-none safe-area-pb bg-gradient-to-t from-black/80 to-transparent">
                <button
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className={`pointer-events-auto w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center border-2 border-white/30 bg-black/60 text-white backdrop-blur-md transition-all
                        ${currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/20 hover:scale-110 shadow-[0_0_15px_rgba(255,255,255,0.2)]'}`}
                >
                    <svg className="w-8 h-8 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
                </button>

                <button
                    onClick={handleNext}
                    disabled={currentIndex === slides.length - 1}
                    className={`pointer-events-auto w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center border-2 border-white/30 bg-black/60 text-white backdrop-blur-md transition-all
                        ${currentIndex === slides.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/20 hover:scale-110 shadow-[0_0_15px_rgba(255,255,255,0.2)]'}`}
                >
                    <svg className="w-8 h-8 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"></path></svg>
                </button>
            </div>

        </div>
    );
});
