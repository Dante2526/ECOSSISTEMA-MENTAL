import { useState, useEffect } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { isNativePlatform } from '../services/capacitorPlatform';

/**
 * Hook que monitora se o app está online ou offline.
 * Usa @capacitor/network no Android nativo e eventos navigator/window na Web.
 */
export function useOnlineStatus(): boolean {
    const [isOnline, setIsOnline] = useState<boolean>(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );

    useEffect(() => {
        if (isNativePlatform()) {
            let isUnmounted = false;
            let listenerHandle: PluginListenerHandle | null = null;

            Network.getStatus()
                .then((status) => {
                    if (!isUnmounted) {
                        setIsOnline(status.connected);
                    }
                })
                .catch(() => {});

            Network.addListener('networkStatusChange', (status) => {
                if (!isUnmounted) {
                    setIsOnline(status.connected);
                }
            }).then((handle) => {
                if (isUnmounted) {
                    handle.remove().catch(() => {});
                } else {
                    listenerHandle = handle;
                }
            }).catch(() => {});

            return () => {
                isUnmounted = true;
                listenerHandle?.remove().catch(() => {});
            };
        }

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
}

