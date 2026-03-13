import React from 'react';

interface UpdatePromptProps {
    offlineReady: boolean;
    needRefresh: boolean;
    onUpdate: () => void;
    onClose: () => void;
}

/**
 * Toast que aparece quando há uma nova versão do Service Worker
 * disponível, permitindo ao usuário atualizar imediatamente.
 */
export const UpdatePrompt: React.FC<UpdatePromptProps> = React.memo(({
    needRefresh,
    onUpdate,
    onClose,
}) => {
    if (!needRefresh) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] animate-slide-up">
            <div className="bg-gradient-to-r from-purple-900/95 to-indigo-900/95 backdrop-blur-lg border border-purple-500/40 rounded-2xl p-4 shadow-2xl shadow-purple-900/30 max-w-xs">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500/20 border border-purple-400/30 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold mb-1">Nova versão disponível</p>
                        <p className="text-purple-200/70 text-xs mb-3">Atualize para a versão mais recente.</p>
                        <div className="flex gap-2">
                            <button
                                onClick={onUpdate}
                                className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                            >
                                ATUALIZAR
                            </button>
                            <button
                                onClick={onClose}
                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-purple-200 text-xs font-medium transition-all duration-200"
                            >
                                DEPOIS
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

UpdatePrompt.displayName = 'UpdatePrompt';
