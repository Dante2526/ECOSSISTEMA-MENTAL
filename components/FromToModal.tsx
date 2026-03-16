
import React, { useState, useEffect, useRef } from 'react';

interface FromToModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (from: string, to: string) => void;
}

export const FromToModal: React.FC<FromToModalProps> = ({ isOpen, onClose, onNavigate }) => {
    const [fromValue, setFromValue] = useState('');
    const [toValue, setToValue] = useState('');
    const fromInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setFromValue('');
            setToValue('');
            // No mobile evitamos focus automático para não pular o teclado
            if (window.innerWidth > 768) {
                setTimeout(() => fromInputRef.current?.focus(), 100);
            }
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (fromValue.trim() && toValue.trim()) {
            onNavigate(fromValue.trim(), toValue.trim());
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/75 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div 
                className="w-full max-w-md bg-slate-900/90 border-2 border-purple-500/40 rounded-2xl shadow-[0_0_50px_rgba(168,85,247,0.2)] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 border-b border-purple-500/20 bg-gradient-to-r from-purple-900/20 to-transparent flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        Navegação De-Para
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-purple-300 uppercase tracking-wider ml-1">Origem (De)</label>
                        <div className="relative">
                            <input
                                ref={fromInputRef}
                                type="text"
                                value={fromValue}
                                onChange={e => {
                                    const start = e.target.selectionStart;
                                    const end = e.target.selectionEnd;
                                    const val = e.target.value.toUpperCase();
                                    setFromValue(val);
                                    // Preserva posição do cursor após o render
                                    requestAnimationFrame(() => {
                                        if (e.target) {
                                            e.target.setSelectionRange(start, end);
                                        }
                                    });
                                }}
                                placeholder="Ex: 152, Oficina..."
                                className="w-full bg-slate-800/50 border border-slate-700 focus:border-purple-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 transition-all outline-none uppercase"
                            />
                            <div className="absolute right-3 top-3.5 text-xs text-purple-500/50 font-bold uppercase">De</div>
                        </div>
                    </div>

                    <div className="flex justify-center -my-2">
                        <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center border border-purple-500/30">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-emerald-300 uppercase tracking-wider ml-1">Destino (Para)</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={toValue}
                                onChange={e => {
                                    const start = e.target.selectionStart;
                                    const end = e.target.selectionEnd;
                                    const val = e.target.value.toUpperCase();
                                    setToValue(val);
                                    requestAnimationFrame(() => {
                                        if (e.target) {
                                            e.target.setSelectionRange(start, end);
                                        }
                                    });
                                }}
                                placeholder="Ex: 167, Pial..."
                                className="w-full bg-slate-800/50 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 transition-all outline-none uppercase"
                            />
                            <div className="absolute right-3 top-3.5 text-xs text-emerald-500/50 font-bold uppercase">Para</div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={!fromValue.trim() || !toValue.trim()}
                        className="w-full bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        INICIAR NAVEGAÇÃO
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </button>
                    
                    <p className="text-center text-xs text-slate-500 mt-4">
                        Você também pode dizer: <span className="text-purple-400 italic font-medium">"De 152 para 167"</span>
                    </p>
                </form>
            </div>
        </div>
    );
};
