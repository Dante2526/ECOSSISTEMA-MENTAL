import { pipeline, env } from '@xenova/transformers';

// Configuração para uso do cache do navegador (Cache API)
env.allowLocalModels = false;
env.useBrowserCache = true;

console.log("⚡ [Whisper Worker] Worker iniciado e pronto para carregar.");

class WhisperWorker {
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            console.log("⚡ [Whisper Worker] Criando nova instância de pipeline...");
            try {
                this.instance = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                    progress_callback,
                });
                console.log("⚡ [Whisper Worker] Pipeline do Whisper carregado com sucesso!");
            } catch (err) {
                console.error("❌ [Whisper Worker] Erro crítico ao carregar pipeline:", err);
                throw err;
            }
        }
        return this.instance;
    }
}

self.onmessage = async (event) => {
    const { audio, language } = event.data;

    if (!audio) {
        console.warn("⚠️ [Whisper Worker] Recebida mensagem sem áudio.");
        return;
    }

    console.log(`⚡ [Whisper Worker] Áudio recebido (${audio.length} samples). Iniciando transcrição...`);

    try {
        const transcriber = await WhisperWorker.getInstance((progress) => {
            if (progress.status === 'progress') {
              self.postMessage({ type: 'STATUS', status: 'loading', progress: progress.progress });
            }
        });

        self.postMessage({ type: 'STATUS', status: 'processing' });

        const startTime = performance.now();
        const output = await transcriber(audio, {
            chunk_length_s: 30,
            stride_length_s: 5,
            language: language || 'portuguese',
            task: 'transcribe',
            return_timestamps: false,
        });

        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ [Whisper Worker] Transcrição concluída em ${duration}s: "${output.text}"`);

        self.postMessage({
            type: 'RESULT',
            text: output.text
        });

    } catch (error) {
        console.error("❌ [Whisper Worker] Erro durante o processamento:", error);
        self.postMessage({
            type: 'ERROR',
            error: error.message || 'Erro desconhecido no processamento de voz'
        });
    }
};
