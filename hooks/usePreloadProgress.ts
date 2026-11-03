import { useState, useEffect, useRef } from 'react';
import { OrbitalSystem } from '../types';
import { whisperWorkerManager, WhisperWorkerMessage } from '../services/whisperWorkerManager';

export interface PreloadProgress {
    totalItems: number;
    completedItems: number;
    percentage: number;
    isFinished: boolean;
    statusText: string;
}

export const usePreloadProgress = (systems: OrbitalSystem[]) => {
    const [progress, setProgress] = useState<PreloadProgress>({
        totalItems: 0,
        completedItems: 0,
        percentage: 0,
        isFinished: true, // Começa assumindo finalizado se não houver o que baixar
        statusText: '',
    });

    // Usamos ref para rastrear progresso atual síncronamente sem dependencia de effect callback
    const progressState = useRef({
        total: 0,
        completed: 0,
    });

    useEffect(() => {
        // 1. Verificar no localStorage se nós JÁ finalizamos o download 100% no passado
        // para não encher a tela do usuário com contadores desnecessários em visitas futuras.
        const CACHE_FLAG = 'ecossistema_offline_ready_v2';
        if (localStorage.getItem(CACHE_FLAG) === 'true') {
            setProgress(prev => ({ ...prev, isFinished: true, percentage: 100 }));

            // Mesmo com flag, disparamos os pré-carregamentos SILENCIOSOS apenas
            // para puxar imagens novas que tenham entrado em atualizações
            silentPreloadAll(systems);
            return;
        }

        // 2. Coletar todas as URLs que precisamos garantir cache
        const urlsToCache = new Set<string>();
        urlsToCache.add("/images/MINHA-LOGO.svg");
        urlsToCache.add("/images/Layout-1-page-0001.webp"); // Mapa

        systems.forEach(system => {
            urlsToCache.add(system.iconUrl);
            system.modalUrls.forEach(url => urlsToCache.add(url));
        });

        const urls = Array.from(urlsToCache);
        // Peso maior pro arquivo do Whisper por ser maior, para fluir bem na barra
        const WHISPER_WEIGHT = 70; 
        const totalDownloads = urls.length + WHISPER_WEIGHT;

        progressState.current.total = totalDownloads;
        progressState.current.completed = 0;

        setProgress({
            totalItems: totalDownloads,
            completedItems: 0,
            percentage: 0,
            isFinished: false,
            statusText: `Iniciando cache...`,
        });

        // Função auxiliar para atualizar UI
        const tickProgress = (weight: number = 1) => {
            progressState.current.completed += weight;
            const currentComplete = progressState.current.completed;
            const total = progressState.current.total;

            let perc = Math.round((currentComplete / total) * 100);
            if (perc > 100) perc = 100;

            const finished = currentComplete >= total - 0.1;

            setProgress({
                totalItems: total,
                completedItems: currentComplete,
                percentage: perc,
                isFinished: finished,
                statusText: finished ? "✅ Sistema 100% para uso offline!" : `Baixando IA para uso offline: ${perc}% `,
            });

            if (finished) {
                localStorage.setItem(CACHE_FLAG, 'true');
            }
        };

        // 3. Pré-carregar Imagens (lotes de 5 para não travar a UI) usando Cache API para garantir persistência offline
        const BATCH_SIZE = 5;
        let i = 0;

        const preloadImageToCache = async (url: string) => {
            try {
                if ('caches' in window) {
                    const cache = await caches.open('local-railway-assets-cache');
                    const cachedResponse = await cache.match(url);
                    if (cachedResponse) {
                        return; // Já está no cache
                    }
                    const response = await fetch(url);
                    if (response.ok) {
                        await cache.put(url, response);
                    }
                } else {
                    throw new Error('Cache API não suportado');
                }
            } catch (err) {
                // Fallback tradicional se o fetch falhar ou não suportar caches
                await new Promise<void>((resolve) => {
                    const img = new Image();
                    img.onload = img.onerror = () => resolve();
                    img.src = url;
                });
            }
        };

        const loadNextBatch = async () => {
            if (i >= urls.length) return;

            const batch = urls.slice(i, i + BATCH_SIZE);
            i += BATCH_SIZE;

            // Executa o lote de downloads concorrentemente
            await Promise.all(batch.map(async (url) => {
                await preloadImageToCache(url);
                tickProgress(1); // Imagens = peso 1
            }));

            setTimeout(loadNextBatch, 50); // Respirar UI antes do próximo lote
        };

        setTimeout(() => {
            loadNextBatch();
        }, 500);

        // 4. Pré-carregar Model Whisper (Xenova) via gerenciador unificado
        let unsubscribeWhisper: (() => void) | null = null;
        let lastTickWeight = 0;

        const preloadWhisperModel = () => {
            if (localStorage.getItem(CACHE_FLAG) === 'true') return;
            
            console.log("⚡ [PWA] Conectando ao Worker compartilhado para download da IA...");
            
            unsubscribeWhisper = whisperWorkerManager.subscribe((data: WhisperWorkerMessage) => {
                const { type, progress } = data;

                if (type === 'PRELOAD_PROGRESS') {
                    // progress vem de 0 a 100
                    const currentProgress = typeof progress === 'number' ? progress : 0;
                    const currentWeight = (currentProgress / 100) * WHISPER_WEIGHT;
                    const tickDiff = currentWeight - lastTickWeight;
                    
                    if (tickDiff > 0.1 || currentProgress === 100) {
                        tickProgress(tickDiff);
                        lastTickWeight = currentWeight;
                    }
                } else if (type === 'PRELOAD_DONE') {
                    console.log("⚡ [PWA] Worker finalizou download da IA com sucesso.");
                    const remaining = WHISPER_WEIGHT - lastTickWeight;
                    if (remaining > 0) tickProgress(remaining);
                    if (unsubscribeWhisper) {
                        unsubscribeWhisper();
                        unsubscribeWhisper = null;
                    }
                } else if (type === 'PRELOAD_ERROR') {
                    console.error("❌ [PWA] Falha no download do Whisper:", data.error);
                    // Pular peso para não travar a barra se falhar (ex: sem internet já no começo)
                    const remaining = WHISPER_WEIGHT - lastTickWeight;
                    if (remaining > 0) tickProgress(remaining);
                    if (unsubscribeWhisper) {
                        unsubscribeWhisper();
                        unsubscribeWhisper = null;
                    }
                }
            });

            whisperWorkerManager.preload();
        };

        const timerId = setTimeout(preloadWhisperModel, 1000);

        return () => {
            clearTimeout(timerId);
            if (unsubscribeWhisper) {
                unsubscribeWhisper();
            }
        };

    }, [systems]);


    const silentPreloadAll = (systems: OrbitalSystem[]) => {
        // Usado para visitas subsequentes: apenas chuta as requisições em background
        // para o Service Worker pegar imagens novas se houverem, sem mexer na UI
        const urlsToCache = new Set<string>(["/images/MINHA-LOGO.svg", "/images/Layout-1-page-0001.webp"]);
        systems.forEach(system => {
            urlsToCache.add(system.iconUrl);
            system.modalUrls.forEach(url => urlsToCache.add(url));
        });
        const urls = Array.from(urlsToCache);

        const preloadImageToCache = async (url: string) => {
            try {
                if ('caches' in window) {
                    const cache = await caches.open('local-railway-assets-cache');
                    const cachedResponse = await cache.match(url);
                    if (cachedResponse) return;
                    const response = await fetch(url);
                    if (response.ok) {
                        await cache.put(url, response);
                    }
                }
            } catch (_) {
                new Image().src = url;
            }
        };

        let i = 0;
        const loadNextBatch = async () => {
            if (i >= urls.length) return;
            const batch = urls.slice(i, i + 5);
            i += 5;
            await Promise.all(batch.map(url => preloadImageToCache(url)));
            setTimeout(loadNextBatch, 100);
        };
        setTimeout(loadNextBatch, 2000);

        // Preload silencioso do Whisper via Worker compartilhado (apenas se não houver flag de sucesso)
        if (localStorage.getItem('ecossistema_offline_ready_v2') !== 'true') {
            whisperWorkerManager.preload();
        }
    };


    return progress;
};
