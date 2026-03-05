import React, { useState, useEffect, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface ImageModalProps {
    isOpen: boolean;
    imageUrls: string[];
    onClose: () => void;
}

const FALLBACK_IMAGE_URL = 'https://placehold.co/600x400/222/FFF?text=Imagem+Nao+Encontrada';

export const ImageModal: React.FC<ImageModalProps> = React.memo(({ isOpen, imageUrls, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isRendered, setIsRendered] = useState(isOpen);
    const [isVisible, setIsVisible] = useState(isOpen);

    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
            setCurrentIndex(0);
            setIsLoading(true);
            // Small delay to allow DOM to render before applying opacity 1
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsVisible(true);
                });
            });
        } else {
            setIsVisible(false);
            const timer = setTimeout(() => setIsRendered(false), 300); // match transition duration
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Smart Prefetching: When the current image changes, start loading the NEXT image in the background.
    useEffect(() => {
        if (!isOpen || imageUrls.length <= 1) return;

        const nextIndex = (currentIndex + 1) % imageUrls.length;
        const img = new Image();
        img.src = imageUrls[nextIndex];
    }, [currentIndex, isOpen, imageUrls]);

    const handleNext = useCallback(() => {
        if (imageUrls.length > 1) {
            setIsLoading(true);
            setCurrentIndex((prev) => (prev + 1) % imageUrls.length);
        }
    }, [imageUrls.length]);

    const handlePrev = useCallback(() => {
        if (imageUrls.length > 1) {
            setIsLoading(true);
            setCurrentIndex((prev) => (prev - 1 + imageUrls.length) % imageUrls.length);
        }
    }, [imageUrls.length]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'Escape') onClose();
            if (imageUrls.length > 1) {
                if (e.key === 'ArrowRight') handleNext();
                if (e.key === 'ArrowLeft') handlePrev();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, handleNext, handlePrev, imageUrls.length]);

    if (!isRendered) return null;

    const showNav = imageUrls.length > 1;

    return (
        <>
            <div
                className={`fixed inset-0 bg-black/90 z-[9998] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            ></div>

            {/* Container fixo cobrindo a tela toda, com pointer-events-none no fundo */}
            <div
                className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            >
                {/* Wrapper com tamanho máximo da imagem atual - "âncora" de dimensões */}
                <div
                    className="relative max-w-[95vw] max-h-[90vh] w-full h-full flex items-center justify-center bg-black rounded-lg border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.1)] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                    style={{ aspectRatio: 'unset' }}
                >

                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center z-[60] bg-black/80 rounded-lg">
                            <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                        </div>
                    )}

                    {imageUrls.map((url, i) => (
                        <div
                            key={`slide-${url}-${i}`}
                            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${i === currentIndex ? 'opacity-100 z-50' : 'opacity-0 z-0 pointer-events-none'}`}
                        >
                            {i === currentIndex ? (
                                <TransformWrapper
                                    key={`transform-${currentIndex}`}
                                    initialScale={1}
                                    minScale={0.5}
                                    maxScale={8}
                                    centerOnInit={true}
                                    wheel={{ smoothStep: 0.01 }}
                                >
                                    <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <img
                                            src={url}
                                            onLoad={() => { if (i === currentIndex) setIsLoading(false); }}
                                            onError={(e) => {
                                                if (i === currentIndex) setIsLoading(false);
                                                (e.target as HTMLImageElement).src = FALLBACK_IMAGE_URL;
                                            }}
                                            decoding="async"
                                            className={`max-w-[95vw] max-h-[90vh] w-auto h-auto object-contain block transition-opacity duration-300 ${isLoading && i === currentIndex ? 'opacity-0' : 'opacity-100'}`}
                                            alt={`Diagrama ${i + 1}`}
                                        />
                                    </TransformComponent>
                                </TransformWrapper>
                            ) : (
                                <img
                                    src={url}
                                    decoding="async"
                                    className="max-w-[95vw] max-h-[90vh] w-auto h-auto object-contain block"
                                    alt={`Diagrama pre-carregado ${i + 1}`}
                                />
                            )}
                        </div>
                    ))}

                    <button title="Fechar" onClick={onClose} className="absolute top-4 right-4 w-10 h-10 bg-black/60 text-white border border-white/30 rounded-full grid place-items-center text-xl z-[102] hover:bg-white/20 transition-colors">
                        ✕
                    </button>

                    {showNav && (
                        <>
                            <button title="Anterior" onClick={handlePrev} className="absolute top-1/2 -translate-y-1/2 left-4 w-12 h-12 bg-black/60 text-white border border-white/30 rounded-full grid place-items-center z-[101] hover:bg-white/20 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                            </button>
                            <button title="Próximo" onClick={handleNext} className="absolute top-1/2 -translate-y-1/2 right-4 w-12 h-12 bg-black/60 text-white border border-white/30 rounded-full grid place-items-center z-[101] hover:bg-white/20 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                            </button>
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 border border-white/10 px-4 py-1 rounded-full text-sm z-[101] text-white">
                                {currentIndex + 1} / {imageUrls.length}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
});
