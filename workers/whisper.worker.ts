import { env, AutoTokenizer, AutoProcessor, AutoModelForSpeechSeq2Seq } from '@xenova/transformers';

// Configuração para uso do cache do navegador (Cache API)
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

console.log("⚡ [Whisper Worker] Worker iniciado. Env:", {
    allowLocalModels: env.allowLocalModels,
    allowRemoteModels: env.allowRemoteModels,
    useBrowserCache: env.useBrowserCache
});

class WhisperWorker {
    static model = null;
    static processor = null;
    static tokenizer = null;

    static async getInstance(progress_callback = null) {
        if (this.model === null) {
            console.log("⚡ [Whisper Worker] Carregando Modelos de Baixo Nível (Seq2Seq)...");
            const model_id = 'Xenova/whisper-tiny';
            
            try {
                // Carregamento explícito de cada componente
                [this.tokenizer, this.model, this.processor] = await Promise.all([
                    AutoTokenizer.from_pretrained(model_id, { progress_callback }),
                    AutoModelForSpeechSeq2Seq.from_pretrained(model_id, { 
                        quantized: true, 
                        progress_callback 
                    }),
                    AutoProcessor.from_pretrained(model_id, { progress_callback }),
                ]);

                console.log("✅ [Whisper Worker] Componentes carregados com sucesso!");
            } catch (err) {
                console.error("❌ [Whisper Worker] Erro ao carregar componentes:", err);
                throw err;
            }
        }
        return { 
            model: this.model, 
            processor: this.processor, 
            tokenizer: this.tokenizer 
        };
    }
}

self.onmessage = async (event) => {
    const { type, audio, language } = event.data;

    if (type === 'PRELOAD') {
        console.log("⚡ [Whisper Worker] Comando PRELOAD recebido.");
        try {
            await WhisperWorker.getInstance((progress) => {
                if (progress.status === 'progress' || progress.status === 'done') {
                    self.postMessage({ 
                        type: 'PRELOAD_PROGRESS', 
                        file: progress.file,
                        progress: progress.progress || 100,
                        status: progress.status
                    });
                }
            });
            self.postMessage({ type: 'PRELOAD_DONE' });
        } catch (error) {
            self.postMessage({ type: 'PRELOAD_ERROR', error: error.message });
        }
        return;
    }

    if (!audio) return;

    console.log(`⚡ [Whisper Worker] Transcrevendo ${audio.length} samples...`);

    try {
        const { model, processor, tokenizer } = await WhisperWorker.getInstance((progress) => {
            if (progress.status === 'progress') {
                self.postMessage({ type: 'STATUS', status: 'loading', progress: progress.progress });
            }
        });

        self.postMessage({ type: 'STATUS', status: 'processing' });

        const startTime = performance.now();
        
        // Pré-processamento e Geração
        const inputs = await processor(audio);
        const output = await model.generate({
            ...inputs,
            max_new_tokens: 128,
            language: language || 'portuguese',
            task: 'transcribe',
        });

        const decoded = tokenizer.batch_decode(output, { skip_special_tokens: true });
        const transcript = decoded[0].trim();
        
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ [Whisper Worker] Resultado (${duration}s): "${transcript}"`);

        self.postMessage({ type: 'RESULT', text: transcript });

    } catch (error) {
        console.error("❌ [Whisper Worker] Erro:", error);
        self.postMessage({ type: 'ERROR', error: error.message });
    }
};
