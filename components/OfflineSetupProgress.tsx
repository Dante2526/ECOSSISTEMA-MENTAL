import React, { useEffect, useState } from 'react';
import { PreloadProgress } from '../hooks/usePreloadProgress';

interface OfflineSetupProgressProps {
    progress: PreloadProgress;
}

export const OfflineSetupProgress: React.FC<OfflineSetupProgressProps> = React.memo(({ progress }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Só mostramos o componente se ele ainda não baixou da primeira vez
        if (!progress.isFinished && progress.totalItems > 0 && !isVisible) {
            setIsVisible(true);
        }

        // Se ele terminar (isFinished), esperamos uns 3 segundos em verde pra sumir
        if (progress.isFinished && isVisible) {
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, 4000); // 4 seg
            return () => clearTimeout(timer);
        }
    }, [progress.isFinished, progress.totalItems, isVisible]);


    if (!isVisible) return null;

    const isComplete = progress.isFinished;

    return (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-12 scale-95 pointer-events-none'
            }`}>
            <div className={`backdrop-blur-xl border rounded-full px-5 py-3 shadow-2xl flex items-center gap-4 transition-colors duration-500 min-w-[320px] ${isComplete
                    ? 'bg-emerald-900/80 border-emerald-500/50 shadow-emerald-900/40'
                    : 'bg-indigo-900/80 border-indigo-500/50 shadow-indigo-950/50'
                }`}>

                {/* Ícone */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${isComplete ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'
                    }`}>
                    {isComplete ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    )}
                </div>

                {/* Textos & Barra */}
                <div className="flex-1 flex flex-col justify-center min-w-[200px]">
                    <div className="flex justify-between items-end mb-1.5">
                        <span className={`text-[13px] font-semibold tracking-wide ${isComplete ? 'text-emerald-300' : 'text-indigo-200'}`}>
                            {progress.statusText}
                        </span>
                        {!isComplete && (
                            <span className="text-[11px] font-bold text-indigo-300/80 tabular-nums">
                                {progress.percentage}%
                            </span>
                        )}
                    </div>

                    {/* Progress Bar Track */}
                    {(!isComplete) && (
                        <div className="h-1.5 w-full bg-indigo-950/50 rounded-full overflow-hidden shrink-0">
                            {/* Progress Bar Fill */}
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${progress.percentage}%` }}
                            />
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
});

OfflineSetupProgress.displayName = 'OfflineSetupProgress';
