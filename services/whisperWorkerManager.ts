/**
 * Whisper Worker Singleton Manager
 * Unifica e compartilha uma única instância do Web Worker do Whisper (ONNX WASM)
 * entre o pré-carregamento offline e o hook de reconhecimento por voz em tempo real.
 * Evita duplicação de downloads de modelo e economiza centenas de MBs de memória RAM.
 */

export interface WhisperWorkerMessage {
    type: 'STATUS' | 'PRELOAD_PROGRESS' | 'PRELOAD_DONE' | 'PRELOAD_ERROR' | 'RESULT' | 'ERROR';
    text?: string;
    error?: string;
    status?: string;
    progress?: number;
    file?: string;
}

type MessageListener = (data: WhisperWorkerMessage) => void;

class WhisperWorkerManager {
    private worker: Worker | null = null;
    private listeners = new Set<MessageListener>();
    private preloaded = false;
    private preloading = false;
    private processing = false;

    private getWorker(): Worker | null {
        if (typeof window === 'undefined' || typeof Worker === 'undefined') {
            return null;
        }

        if (!this.worker) {
            try {
                this.worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
                    type: 'module'
                });
            } catch (err) {
                console.warn("⚠️ [WhisperManager] Não foi possível criar o Web Worker:", err);
                this.worker = null;
                return null;
            }

            this.worker.onmessage = (event: MessageEvent<WhisperWorkerMessage>) => {
                const data = event.data;
                if (!data) return;

                if (data.type === 'PRELOAD_DONE') {
                    this.preloaded = true;
                    this.preloading = false;
                } else if (data.type === 'PRELOAD_ERROR') {
                    this.preloading = false;
                } else if (data.type === 'RESULT' || data.type === 'ERROR') {
                    this.processing = false;
                }

                // Notificar todos os ouvintes inscritos
                this.listeners.forEach(listener => {
                    try {
                        listener(data);
                    } catch (err) {
                        console.warn("⚠️ [WhisperManager] Erro no listener do worker:", err);
                    }
                });
            };

            this.worker.onerror = (event: ErrorEvent) => {
                event?.preventDefault?.();
                const wasProcessing = this.processing;
                this.preloading = false;
                this.processing = false;

                // Descarta a instância defeituosa/reclamada pelo SO para permitir recriação futura
                try {
                    this.worker?.terminate();
                } catch (_) {}
                this.worker = null;

                const reason = event?.message || 'worker-terminated';
                console.warn("⚠️ [WhisperManager] Worker encerrado ou indisponível:", reason);

                const responseData: WhisperWorkerMessage = wasProcessing
                    ? { type: 'ERROR', error: 'worker-crash' }
                    : { type: 'PRELOAD_ERROR', error: reason };

                this.listeners.forEach(listener => {
                    try {
                        listener(responseData);
                    } catch (_) {}
                });
            };

            this.worker.onmessageerror = (event) => {
                const wasProcessing = this.processing;
                this.preloading = false;
                this.processing = false;
                console.warn("⚠️ [WhisperManager] Erro de serialização no worker:", event);

                if (wasProcessing) {
                    const errorData: WhisperWorkerMessage = {
                        type: 'ERROR',
                        error: 'worker-serialization-error'
                    };
                    this.listeners.forEach(listener => {
                        try {
                            listener(errorData);
                        } catch (_) {}
                    });
                }
            };
        }

        return this.worker;
    }

    /**
     * Inscreve um ouvinte para receber mensagens enviadas pelo worker.
     * Retorna a função de cancelamento de inscrição (unsubscribe).
     */
    public subscribe(listener: MessageListener): () => void {
        this.listeners.add(listener);

        // Se já estava pré-carregado no momento da inscrição, notifica o novo ouvinte
        if (this.preloaded) {
            try {
                listener({ type: 'PRELOAD_DONE' });
            } catch (_) {}
        }

        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Dispara o pré-carregamento do modelo Whisper no worker se ainda não tiver sido feito.
     */
    public preload(): void {
        if (this.preloaded || this.preloading) {
            if (this.preloaded) {
                this.listeners.forEach(l => l({ type: 'PRELOAD_DONE' }));
            }
            return;
        }

        const worker = this.getWorker();
        if (!worker) {
            this.listeners.forEach(l => l({ type: 'PRELOAD_ERROR', error: 'worker-unavailable' }));
            return;
        }

        this.preloading = true;
        try {
            worker.postMessage({ type: 'PRELOAD' });
        } catch (err) {
            this.preloading = false;
            console.warn("⚠️ [WhisperManager] Falha ao enviar PRELOAD ao worker:", err);
        }
    }

    /**
     * Envia buffer de áudio (16kHz) para o worker transcrever.
     * Utiliza Transferable Objects para zero-copy.
     */
    public processAudio(audio: Float32Array, language: string = 'portuguese'): void {
        const worker = this.getWorker();
        if (!worker) {
            this.listeners.forEach(l => l({ type: 'ERROR', error: 'worker-unavailable' }));
            return;
        }

        this.processing = true;
        try {
            worker.postMessage({
                audio,
                language
            }, [audio.buffer]);
        } catch (err) {
            this.processing = false;
            console.warn("⚠️ [WhisperManager] Falha ao enviar áudio para o worker:", err);
            this.listeners.forEach(l => l({ type: 'ERROR', error: 'worker-post-failed' }));
        }
    }

    public isPreloaded(): boolean {
        return this.preloaded;
    }

    public isPreloading(): boolean {
        return this.preloading;
    }
}

export const whisperWorkerManager = new WhisperWorkerManager();
