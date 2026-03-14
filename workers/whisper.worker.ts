import { env, pipeline } from '@xenova/transformers';

// Configuração para uso do cache do navegador (Cache API)
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

class WhisperWorker {
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            console.log("⚡ [Whisper Worker] Carregando Pipeline ASR (OpenAI Whisper - modo alta precisão)...");
            try {
                this.instance = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
                    quantized: true,
                    progress_callback
                });
                console.log("✅ [Whisper Worker] Pipeline carregado com sucesso!");
            } catch (err) {
                console.error("❌ [Whisper Worker] Erro ao carregar pipeline:", err);
                throw err;
            }
        }
        return this.instance;
    }
}

self.onmessage = async (event) => {
    const { type, audio, language } = event.data;

    if (type === 'PRELOAD') {
        try {
            await WhisperWorker.getInstance((progress) => {
                self.postMessage({ 
                    type: 'PRELOAD_PROGRESS', 
                    file: progress.file,
                    progress: progress.progress || 100,
                    status: progress.status
                });
            });
            self.postMessage({ type: 'PRELOAD_DONE' });
        } catch (error) {
            self.postMessage({ type: 'PRELOAD_ERROR', error: error.message });
        }
        return;
    }

    if (!audio) return;

    // Cálculo básico de energia para debug de sinal
    let sum = 0;
    for (let i = 0; i < audio.length; i++) {
        sum += audio[i] * audio[i];
    }
    const energy = Math.sqrt(sum / audio.length);
    console.log(`⚡ [Whisper Worker] Recebidos ${audio.length} samples. Energia RMS: ${energy.toFixed(6)}`);

    try {
        // Monitoramento de memória (Chromium)
        if ((performance as any).memory) {
            const memory = (performance as any).memory;
            console.log(`📊 [Whisper Worker] Memória: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB / ${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`);
        }

        const transcriber = await WhisperWorker.getInstance((progress) => {
            if (progress.status === 'progress') {
                self.postMessage({ type: 'STATUS', status: 'loading', progress: progress.progress });
            }
        });

        self.postMessage({ type: 'STATUS', status: 'processing' });

        const startTime = performance.now();
        
        // Geração via Pipeline (ASR)
        const output = await transcriber(audio, {
            language: language || 'portuguese',
            task: 'transcribe',
            chunk_length_s: 30, // Padrão recomendado
            stride_length_s: 5,
            return_timestamps: false,
            // Parâmetros de geração passados via generate_kwargs
            generate_kwargs: {
                max_new_tokens: 24, // Limite agressivo para resposta instantânea (< 5s)
                repetition_penalty: 1.8, // Bloqueio total de loops
                no_repeat_ngram_size: 3, // Mais rigoroso
                do_sample: false,
                // O Prompt ajuda o modelo a entender o contexto técnico (códigos, números, linhas)
                prompt: "161, 162, 163, 164, 165, 166, 167, 187, Código de linha, orbe 151, um cinco um, cento e cinquenta e um, 187, um oito sete, cento e oitenta e sete, 161, um seis um, 162, um seis dois, 163, um seis três, 164, um seis quatro, 165, um seis cinco, 166, um seis seis, 167, um meia sete, cento e sessenta e sete, 01, zero um, zero hum, 2, dois, doix, 6, meia, mea, 8, oito, ocho, oi, 7, sete, seche, 5, cinco, cincu, 3, três, trex, 201-B, dois zero um b, estação, pial."
            }
        });

        const transcript = output.text.trim();
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        
        console.log(`✅ [Whisper Worker] Resultado (${duration}s): "${transcript}"`);
        self.postMessage({ type: 'RESULT', text: transcript });

    } catch (error) {
        console.error("❌ [Whisper Worker] Erro:", error);
        self.postMessage({ type: 'ERROR', error: error.message });
    }
};
