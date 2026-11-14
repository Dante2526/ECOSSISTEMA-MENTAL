
import { useState, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { isNativePlatform } from '../services/capacitorPlatform';

export const useWakeLock = () => {
    const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

    useEffect(() => {
        if (isNativePlatform()) {
            let disposed = false;
            let appStateListener: PluginListenerHandle | null = null;

            const enableKeepAwake = async () => {
                try {
                    await KeepAwake.keepAwake();
                } catch (err) {
                    console.warn('KeepAwake error:', err);
                }
            };

            enableKeepAwake();

            CapacitorApp.addListener('appStateChange', ({ isActive }) => {
                if (isActive && !disposed) {
                    enableKeepAwake();
                }
            }).then((handle) => {
                if (disposed) {
                    handle.remove().catch(() => {});
                } else {
                    appStateListener = handle;
                }
            }).catch(() => {});

            return () => {
                disposed = true;
                appStateListener?.remove().catch(() => {});
                KeepAwake.allowSleep().catch(() => {});
            };
        }

        let currentLock: WakeLockSentinel | null = null;
        const isSupported = 'wakeLock' in navigator;

        const request = async () => {
            if (!isSupported) return;
            try {
                currentLock = await navigator.wakeLock.request('screen');
                currentLock.addEventListener('release', () => {
                    setWakeLock(null);
                    currentLock = null;
                });
                setWakeLock(currentLock);
            } catch (err: any) {
                if (err.name !== 'NotAllowedError') {
                    console.error(`Wake Lock error: ${err.name}, ${err.message}`);
                }
            }
        };

        request();

        const handleVisibilityChange = () => {
            if (currentLock === null && document.visibilityState === 'visible') {
                request();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('fullscreenchange', handleVisibilityChange);

        return () => {
            if (currentLock) {
                currentLock.release();
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('fullscreenchange', handleVisibilityChange);
        };
    }, []);

    return wakeLock;
};

