
import { useState, useEffect } from 'react';

export const useWakeLock = () => {
    const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

    useEffect(() => {
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
