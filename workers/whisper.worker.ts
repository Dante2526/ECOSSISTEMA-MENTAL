import { env, pipeline } from '@xenova/transformers';

// Configuração para uso do cache do navegador (Cache API)
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

// Flag de debug — reduz console.logs em produção para menos jank mobile
const DEBUG = false;

function debugLog(...args: any[]) {
    if (DEBUG) console.log(...args);
}

class WhisperWorker {
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            console.log("⚡ [Whisper Worker] Carregando Pipeline ASR (OpenAI Whisper)...");
            try {
                this.instance = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
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

// Filtro anti-alucinação estático (criado uma vez, reutilizado)
const HALLUCINATION_PATTERNS = [
    /^m[uú]sica\.?$/i,
    /^obrigad[oa]\.?$/i,  
    /^tchau\.?$/i,
    /^legenda/i,
    /^subscri/i,
    /^subtitle/i,
    /^thank/i,
    /^you$/i,
    /^bye\.?$/i,
    /^the end\.?$/i,
    /^\.*$/,  // Apenas pontos
    /^(?:a|e|o|i|u)\.?$/i, // Uma única vogal
    /^\s*$/,  // Vazio ou só espaços
    /^\.\.\./, // Reticências
    /^music\.?$/i,
    /^\[.*\]$/,  // [Música], [Silencio], etc
    /^\(.*\)$/,  // (Música), (Silencio), etc
];

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

    // Cálculo de energia para filtrar silêncio (única verificação — removida duplicata do hook)
    let sum = 0;
    for (let i = 0; i < audio.length; i++) {
        sum += audio[i] * audio[i];
    }
    const energy = Math.sqrt(sum / audio.length);
    debugLog(`⚡ [Whisper Worker] Recebidos ${audio.length} samples. Energia RMS: ${energy.toFixed(6)}`);

    // Filtro de energia mínima: se o áudio é puro silêncio/ruído, não processar
    if (energy < 0.005) {
        debugLog(`⚡ [Whisper Worker] Energia muito baixa (${energy.toFixed(6)}), descartando.`);
        self.postMessage({ type: 'RESULT', text: '' });
        return;
    }

    try {
        // Monitoramento de memória (Chromium) — apenas debug
        if (DEBUG && (performance as any).memory) {
            const memory = (performance as any).memory;
            debugLog(`📊 [Whisper Worker] Memória: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB / ${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`);
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
                max_new_tokens: 32, // Permite frases mais longas em mobile
                repetition_penalty: 1.8, // Bloqueio total de loops
                no_repeat_ngram_size: 3, // Mais rigoroso
                do_sample: false,
                // O Prompt ajuda o modelo a entender o contexto técnico (códigos, números, linhas)
                prompt: "não use frações, meia é 6, meia sete é 67, 161, 162, 163, 164, 165, 166, 167, 187, Código de linha, orbe 151, um cinco um, cento e cinquenta e um, 187, um oito sete, cento e oitenta e sete, 161, um seis um, 162, um seis dois, 163, um seis três, 164, um seis quatro, 165, um seis cinco, 166, um seis seis, 167, um meia sete, cento e sessenta e sete, 01, zero um, zero hum, 2, dois, doix, 6, meia, mea, meio, 8, oito, ocho, oi, 7, sete, seche, 5, cinco, cincu, sim, 3, três, trex, 201-B, dois zero um b, estação, pial."
            }
        });

        const transcript = output.text.trim();
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        
        debugLog(`✅ [Whisper Worker] Resultado bruto (${duration}s): "${transcript}"`);

        const isHallucination = HALLUCINATION_PATTERNS.some(pattern => pattern.test(transcript));
        
        if (isHallucination || transcript.length < 2) {
            console.warn(`⚠️ [Whisper Worker] Alucinação filtrada: "${transcript}"`);
            self.postMessage({ type: 'RESULT', text: '' });
        } else {
            console.log(`✅ [Whisper Worker] Transcrição: "${transcript}" (${duration}s)`);
            self.postMessage({ type: 'RESULT', text: transcript });
        }

        // Liberar referência do output para permitir GC mais cedo
        // @ts-ignore
        output.text = null;

    } catch (error) {
        console.error("❌ [Whisper Worker] Erro:", error);
        self.postMessage({ type: 'ERROR', error: error.message });
    }
};
