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

    private getWorker(): Worker {
        if (!this.worker) {
            console.log("⚡ [WhisperManager] Criando instância única do Whisper Worker...");
            this.worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
                type: 'module'
            });

            this.worker.onmessage = (event: MessageEvent<WhisperWorkerMessage>) => {
                const data = event.data;

                if (data.type === 'PRELOAD_DONE') {
                    this.preloaded = true;
                    this.preloading = false;
                } else if (data.type === 'PRELOAD_ERROR') {
                    this.preloading = false;
                }

                // Notificar todos os ouvintes inscritos
                this.listeners.forEach(listener => {
                    try {
                        listener(data);
                    } catch (err) {
                        console.error("❌ [WhisperManager] Erro no listener do worker:", err);
                    }
                });
            };

            this.worker.onerror = (event: ErrorEvent) => {
                console.error("🔴 [WhisperManager] Erro fatal no worker:", event.message);
                this.preloading = false;
                const errorData: WhisperWorkerMessage = {
                    type: 'ERROR',
                    error: 'worker-crash'
                };
                this.listeners.forEach(listener => {
                    try {
                        listener(errorData);
                    } catch (_) {}
                });
            };

            this.worker.onmessageerror = (event) => {
                console.error("🔴 [WhisperManager] Erro de mensagem no worker:", event);
                const errorData: WhisperWorkerMessage = {
                    type: 'ERROR',
                    error: 'worker-serialization-error'
                };
                this.listeners.forEach(listener => {
                    try {
                        listener(errorData);
                    } catch (_) {}
                });
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
        // Garante que o worker foi inicializado
        this.getWorker();

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
                // Notificar ouvintes que já está pronto
                this.listeners.forEach(l => l({ type: 'PRELOAD_DONE' }));
            }
            return;
        }

        this.preloading = true;
        const worker = this.getWorker();
        console.log("⚡ [WhisperManager] Solicitando PRELOAD do modelo...");
        worker.postMessage({ type: 'PRELOAD' });
    }

    /**
     * Envia buffer de áudio (16kHz) para o worker transcrever.
     * Utiliza Transferable Objects para zero-copy.
     */
    public processAudio(audio: Float32Array, language: string = 'portuguese'): void {
        const worker = this.getWorker();
        worker.postMessage({
            audio,
            language
        }, [audio.buffer]);
    }

    public isPreloaded(): boolean {
        return this.preloaded;
    }

    public isPreloading(): boolean {
        return this.preloading;
    }
}

export const whisperWorkerManager = new WhisperWorkerManager();
