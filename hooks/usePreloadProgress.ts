import { useState, useEffect, useRef } from 'react';
import { OrbitalSystem } from '../types';

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
        urlsToCache.add("https://i.ibb.co/DPMyNGvd/MINHA-LOGO.png");
        urlsToCache.add("https://i.ibb.co/fzpVkfb1/Layout-1-page-0001.jpg"); // Mapa

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

        // 3. Pré-carregar Imagens (lotes de 5 para não travar a UI)
        const BATCH_SIZE = 5;
        let i = 0;
        const loadNextBatch = () => {
            if (i >= urls.length) return;

            const batch = urls.slice(i, i + BATCH_SIZE);
            i += BATCH_SIZE;

            let completedInBatch = 0;
            batch.forEach(url => {
                const img = new Image();
                img.onload = img.onerror = () => {
                    tickProgress(1); // Imagens = peso 1
                    completedInBatch++;
                    if (completedInBatch === batch.length) {
                        setTimeout(loadNextBatch, 50); // Respirar UI
                    }
                };
                img.src = url;
            });
        };

        setTimeout(loadNextBatch, 500);

        // 4. Pré-carregar Model Whisper (Xenova) via fetch para garantir cache
        const preloadWhisperModel = async () => {
            let lastTickWeight = 0;
            try {
                // Whisper Tiny ~75MB total em vários arquivos, pegamos o maior para o progresso
                const modelUrl = 'https://huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/encoder_model.onnx';
                const response = await fetch(modelUrl);
                const contentLength = +(response.headers.get('Content-Length') || '50000000');
                const reader = response.body?.getReader();
                let receivedLength = 0;

                if (reader) {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        receivedLength += value?.length || 0;
                        const currentWeight = Math.min((receivedLength / contentLength) * WHISPER_WEIGHT, WHISPER_WEIGHT);
                        const tickDiff = currentWeight - lastTickWeight;
                        if (tickDiff > 0.1 || receivedLength === contentLength) {
                            tickProgress(tickDiff);
                            lastTickWeight = currentWeight;
                        }
                    }
                }
            } catch (e) {
                console.warn("Pré-download silencioso do modelo Whisper falhou ou já está no cache", e);
            } finally {
                const remaining = WHISPER_WEIGHT - lastTickWeight;
                if (remaining > 0) {
                    tickProgress(remaining);
                }
            }
        };

        setTimeout(preloadWhisperModel, 1000);

    }, [systems]);


    const silentPreloadAll = (systems: OrbitalSystem[]) => {
        // Usado para visitas subsequentes: apenas chuta as requisições em background
        // para o Service Worker pegar imagens novas se houverem, sem mexer na UI
        const urlsToCache = new Set<string>(["https://i.ibb.co/DPMyNGvd/MINHA-LOGO.png", "https://i.ibb.co/fzpVkfb1/Layout-1-page-0001.jpg"]);
        systems.forEach(system => {
            urlsToCache.add(system.iconUrl);
            system.modalUrls.forEach(url => urlsToCache.add(url));
        });
        const urls = Array.from(urlsToCache);
        let i = 0;
        const loadNextBatch = () => {
            if (i >= urls.length) return;
            const batch = urls.slice(i, i + 5);
            i += 5;
            let completedInBatch = 0;
            batch.forEach(url => {
                const img = new Image();
                img.onload = img.onerror = () => {
                    completedInBatch++;
                    if (completedInBatch === batch.length) setTimeout(loadNextBatch, 100);
                };
                img.src = url;
            });
        };
        setTimeout(loadNextBatch, 2000);

        try { fetch('/models/vosk-model-small-pt-0.3.zip'); } catch (e) { }
    };


    return progress;
};
