import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import AmvSimulation from './AmvSimulation';

interface ImageModalProps {
    isOpen: boolean;
    imageUrls: string[];
    systemId?: string;
    systemName?: string;
    onClose: () => void;
}

const FALLBACK_IMAGE_URL = 'https://placehold.co/600x400/222/FFF?text=Imagem+Nao+Encontrada';

export const ImageModal: React.FC<ImageModalProps> = React.memo(({ isOpen, imageUrls, systemId = '', systemName = '', onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isRendered, setIsRendered] = useState(isOpen);
    const [isVisible, setIsVisible] = useState(isOpen);
    const [isSimulationOpen, setIsSimulationOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
            setCurrentIndex(0);
            setIsLoading(true);
            setIsSimulationOpen(false);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsVisible(true);
                });
            });
        } else {
            setIsVisible(false);
            const timer = setTimeout(() => setIsRendered(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || imageUrls.length <= 1) return;

        const nextIndex = (currentIndex + 1) % imageUrls.length;
        const img = new Image();
        img.src = imageUrls[nextIndex];
    }, [currentIndex, isOpen, imageUrls]);

    const checkCache = useCallback((index: number) => {
        const imgElements = document.querySelectorAll('.image-slide img') as NodeListOf<HTMLImageElement>;
        const targetImg = imgElements[index];
        if (targetImg && targetImg.complete && targetImg.naturalHeight !== 0) {
            return true;
        }
        return false;
    }, []);

    const handleNext = useCallback(() => {
        if (imageUrls.length > 1) {
            const nextIndex = (currentIndex + 1) % imageUrls.length;
            if (!checkCache(nextIndex)) {
                setIsLoading(true);
            }
            setCurrentIndex(nextIndex);
        }
    }, [imageUrls.length, currentIndex, checkCache]);

    const handlePrev = useCallback(() => {
        if (imageUrls.length > 1) {
            const prevIndex = (currentIndex - 1 + imageUrls.length) % imageUrls.length;
            if (!checkCache(prevIndex)) {
                setIsLoading(true);
            }
            setCurrentIndex(prevIndex);
        }
    }, [imageUrls.length, currentIndex, checkCache]);

    useEffect(() => {
        if (!isOpen) return;
        
        const checkImageRef = setTimeout(() => {
            if (checkCache(currentIndex)) {
                setIsLoading(false);
            }
        }, 30);

        return () => clearTimeout(checkImageRef);
    }, [currentIndex, isOpen, checkCache]);

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
            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes modal3dIn {
                        from { opacity: 0; transform: scale3d(0.96, 0.96, 1) translateY(8px); }
                        to { opacity: 1; transform: scale3d(1, 1, 1) translateY(0); }
                    }
                    .animate-fade-in {
                        animation: fadeIn 0.3s ease-in-out forwards;
                    }
                    .animate-fade-in-delayed {
                        animation: fadeIn 0.3s 0.3s ease-in-out both;
                    }
                    .animate-modal-3d {
                        animation: modal3dIn 0.24s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                        will-change: transform, opacity;
                    }
                `}
            </style>
            <div
                className={`fixed inset-0 bg-black/90 z-[9998] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            ></div>

            <div
                className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            >
                <div
                    className="relative flex items-center justify-center bg-black rounded-lg border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.1)] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Imagem fantasma invisível que define as dimensões reais do container */}
                    <img
                        src={imageUrls[currentIndex]}
                        aria-hidden="true"
                        decoding="async"
                        className="max-w-[95vw] max-h-[90vh] min-w-[300px] min-h-[200px] w-auto h-auto object-contain block invisible"
                        alt=""
                    />

                    {imageUrls.map((url, i) => (
                        <div
                            key={`slide-${i}`}
                            className={`image-slide absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${i === currentIndex ? 'opacity-100 z-50' : 'opacity-0 z-0 pointer-events-none'}`}
                        >
                            <TransformWrapper
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
                                        className={`max-w-[95vw] max-h-[90vh] min-w-[300px] min-h-[200px] w-auto h-auto object-contain block transition-opacity duration-500 ${isLoading && i === currentIndex ? 'opacity-0' : 'opacity-100'}`}
                                        alt={`Foto ${i + 1}`}
                                    />
                                </TransformComponent>
                            </TransformWrapper>
                        </div>
                    ))}

                    {/* Spinner com delay real para não piscar em fotos rápidas/cache */}
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center z-[60] bg-black/20 animate-fade-in-delayed">
                            <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
                        </div>
                    )}

                    <button title="Fechar" onClick={onClose} className="absolute top-4 right-4 w-10 h-10 bg-black/60 text-white border border-white/30 rounded-full grid place-items-center text-xl z-[102] hover:bg-white/20 transition-colors">
                        ✕
                    </button>

                    {systemId && (
                        <button 
                            title="Simular AMV 3D" 
                            onClick={() => setIsSimulationOpen(true)} 
                            className={`absolute ${systemId === 'watchSystem5' ? 'bottom-6 right-6' : 'top-4 left-4'} w-10 h-10 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-full border border-indigo-400/40 grid place-items-center z-[101] hover:scale-105 transition-all duration-200 shadow-[0_4px_15px_rgba(79,70,229,0.5)] animate-fade-in`}
                        >
                            3D
                        </button>
                    )}

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

                {isSimulationOpen && (
                    <div
                        className="fixed inset-0 z-[10010] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
                        onClick={(e) => { e.stopPropagation(); setIsSimulationOpen(false); }}
                    >
                        <div
                            className="relative w-[96vw] h-[92vh] rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-[#0a0a0c] animate-modal-3d"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Suspense fallback={
                                <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center bg-[#0a0a0c] text-white gap-3">
                                    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                                    <span className="text-xs font-semibold text-indigo-300">Preparando Simulação 3D...</span>
                                </div>
                            }>
                                <AmvSimulation
                                    systemId={systemId}
                                    systemName={systemName}
                                    onClose={() => setIsSimulationOpen(false)}
                                    inlineMode={true}
                                />
                            </Suspense>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
});

