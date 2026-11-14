import React, { useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { UpdatePrompt } from './UpdatePrompt';

/**
 * Componente isolado para registro do Service Worker apenas no ambiente Web/PWA.
 * Não é montado quando executado dentro do Capacitor nativo.
 */
export const PwaUpdater: React.FC = React.memo(() => {
    const {
        offlineReady: [offlineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registrado:', r);
        },
        onRegisterError(error) {
            console.error('Erro ao registrar SW:', error);
        },
    });

    const handleUpdateSW = useCallback(() => updateServiceWorker(true), [updateServiceWorker]);
    const handleDismissRefresh = useCallback(() => setNeedRefresh(false), [setNeedRefresh]);

    return (
        <UpdatePrompt
            offlineReady={offlineReady}
            needRefresh={needRefresh}
            onUpdate={handleUpdateSW}
            onClose={handleDismissRefresh}
        />
    );
});

PwaUpdater.displayName = 'PwaUpdater';
