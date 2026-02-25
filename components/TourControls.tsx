
import React from 'react';

interface TourControlsProps {
    tourName: string;
    currentStep: number;
    totalSteps: number;
    onNext: () => void;
    onPrev: () => void;
    onExit: () => void;
}

export const TourControls: React.FC<TourControlsProps> = ({ tourName, currentStep, totalSteps, onNext, onPrev, onExit }) => {
    return (
        <div className="fixed top-0 left-0 right-0 bg-black/80 text-white z-50 flex items-center justify-between p-3 border-b border-purple-500/30 shadow-lg">
            <div className="flex-1 text-left">
                <h3 className="font-bold text-lg">{tourName}</h3>
                <p className="text-sm text-slate-300">Etapa {currentStep} de {totalSteps}</p>
            </div>
            <div className="flex items-center gap-4 flex-1 justify-center">
                <button 
                    onClick={onPrev} 
                    disabled={currentStep <= 1} 
                    className="px-4 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-slate-600/50 border-slate-500 hover:bg-slate-600 enabled:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    &larr; Anterior
                </button>
                <button 
                    onClick={onNext} 
                    disabled={currentStep >= totalSteps}
                    className="px-4 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-slate-600/50 border-slate-500 hover:bg-slate-600 enabled:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Próximo &rarr;
                </button>
            </div>
            <div className="flex-1 text-right">
                <button 
                    onClick={onExit} 
                    className="px-4 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-red-600/50 border-red-500 hover:bg-red-600 hover:text-white hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                >
                    Sair do Tour
                </button>
            </div>
        </div>
    );
};
