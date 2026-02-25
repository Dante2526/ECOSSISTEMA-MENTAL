
import React, { useState, useEffect } from 'react';

interface AdminLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogin: (email: string) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ isOpen, onClose, onLogin }) => {
    const [email, setEmail] = useState('');

    useEffect(() => {
        if (isOpen) setEmail('');
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onLogin(email);
    };

    if (!isOpen) return null;

    const inputClasses = "w-full bg-slate-800/50 border-b-2 border-slate-600 rounded-t px-3 py-2 text-white placeholder-slate-400 transition-colors focus:outline-none focus:border-purple-500 focus:bg-slate-800";
    const labelClasses = "block text-sm font-bold text-purple-300 mb-2 tracking-wider uppercase";

    return (
        <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="w-full max-w-md bg-slate-900/80 border border-purple-500/30 rounded-lg shadow-2xl flex flex-col text-white overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="relative p-4 border-b border-purple-500/20 flex justify-center items-center">
                    <h3 className="text-lg font-bold tracking-widest text-center">ACESSO DE ADMINISTRADOR</h3>
                    <button
                        onClick={onClose}
                        className="absolute top-1/2 right-3 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-all flex items-center justify-center border border-slate-700 hover:border-slate-600 hover:rotate-90"
                        aria-label="Fechar modal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <label htmlFor="admin-email" className={labelClasses}>Email</label>
                        <input
                            id="admin-email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className={inputClasses}
                            placeholder="seuemail@exemplo.com"
                            autoFocus
                        />
                    </div>
                    <div className="p-4 border-t border-purple-500/20 flex justify-end items-center gap-4 bg-slate-900/50">
                        <button type="button" onClick={onClose} className="px-5 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-slate-600/50 border-slate-500 hover:bg-slate-600 hover:text-white">
                            Cancelar
                        </button>
                        <button type="submit" className="px-5 py-2 rounded-md font-bold transition-all duration-300 text-sm border-2 bg-purple-600/50 border-purple-500 hover:bg-purple-600 hover:text-white hover:shadow-[0_0_15px_rgba(192,132,252,0.5)]">
                            Entrar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
