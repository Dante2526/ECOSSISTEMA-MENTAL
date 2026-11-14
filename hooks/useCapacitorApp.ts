import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNativePlatform } from '../services/capacitorPlatform';
import { dispatchCapacitorBackButton } from '../services/backButtonHandler';

/**
 * Gerencia ciclo de vida e integrações nativas globais quando em execução no Capacitor (Android):
 * - Oculta SplashScreen após a primeira renderização
 * - Configura StatusBar escura com texto claro
 * - Conecta o botão físico Voltar do Android à pilha LIFO de modais ou minimiza o app na raiz
 * - Limpa eventuais Service Workers residuais em ambiente nativo
 */
export function useCapacitorApp(): void {
    useEffect(() => {
        if (!isNativePlatform()) return;

        let isUnmounted = false;
        let backListenerHandle: PluginListenerHandle | null = null;

        // 1. Remover qualquer Service Worker residual caso exista na WebView
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                registrations.forEach((registration) => {
                    registration.unregister().catch(() => {});
                });
            }).catch(() => {});
        }

        // 2. Configurar StatusBar
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});

        // 3. Ocultar SplashScreen suavemente após a primeira pintura da UI
        let raf2 = 0;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
            });
        });
        const splashFallbackTimer = window.setTimeout(() => {
            SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
        }, 1200);

        // 4. Tratar botão físico "Voltar" do Android
        CapacitorApp.addListener('backButton', async () => {
            const handledByModal = dispatchCapacitorBackButton();
            if (handledByModal) return;

            try {
                await CapacitorApp.minimizeApp();
            } catch (_) {
                await CapacitorApp.exitApp().catch(() => {});
            }
        }).then((handle) => {
            if (isUnmounted) {
                handle.remove().catch(() => {});
            } else {
                backListenerHandle = handle;
            }
        }).catch((err) => {
            console.warn('⚠️ [Capacitor] Erro ao registrar listener backButton:', err);
        });

        return () => {
            isUnmounted = true;
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
            clearTimeout(splashFallbackTimer);
            backListenerHandle?.remove().catch(() => {});
        };
    }, []);
}
