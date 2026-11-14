import { Capacitor } from '@capacitor/core';

/**
 * Retorna true quando o app está executando dentro do runtime nativo do Capacitor
 * (Android/iOS) e false quando executado no navegador Web/PWA.
 */
export function isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
}

export function getCapacitorPlatform(): string {
    return Capacitor.getPlatform();
}

export function isAndroidNative(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
