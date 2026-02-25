
import React from 'react';
import { Tour } from '../types';

interface TourSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    tours: Tour[];
    onSelectTour: (tour: Tour) => void;
}

export const TourSelectionModal: React.FC<TourSelectionModalProps> = ({ isOpen, onClose, tours, onSelectTour }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 z-[9990] flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="w-full max-w-md bg-slate-900/80 border border-purple-500/30 rounded-lg shadow-2xl flex flex-col text-white overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-purple-500/20 flex justify-between items-center">
                    <h3 className="text-lg font-bold tracking-widest">SELECIONE UM TOUR</h3>
                    <button onClick={onClose} className="text-2xl text-slate-400 hover:text-white transition-colors">&times;</button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    {tours.length > 0 ? (
                        <ul className="space-y-2">
                            {tours.map(tour => (
                                <li key={tour.id}>
                                    <button 
                                        onClick={() => onSelectTour(tour)}
                                        className="w-full text-left p-4 bg-slate-800/50 rounded-md border border-slate-700 hover:bg-purple-600/30 hover:border-purple-500 transition-all"
                                    >
                                        <p className="font-bold">{tour.name}</p>
                                        <p className="text-xs text-slate-400">{tour.steps.length} {tour.steps.length === 1 ? 'etapa' : 'etapas'}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-slate-400 py-8">Nenhum tour foi criado ainda.</p>
                    )}
                </div>
            </div>
        </div>
    );
};
