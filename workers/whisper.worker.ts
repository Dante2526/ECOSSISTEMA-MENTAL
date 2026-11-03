import { 
    env, 
    AutoTokenizer, 
    AutoProcessor, 
    AutoModelForSpeechSeq2Seq, 
    AutomaticSpeechRecognitionPipeline 
} from '@huggingface/transformers';

// Configuração para uso do cache do navegador (Cache API)
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

// Define explicitamente o caminho do WASM via CDN (cacheado pelo Service Worker em CacheFirst)
// Isso evita o erro do Vite no modo dev ("Failed to load url /ort/*.mjs?import - file is in /public")
// e evita que o Terser corrompa o arquivo no build de produção.
env.backends.onnx.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${env.version}/dist/`;
// IMPORTANTE: Em ambientes sem headers COOP/COEP (SharedArrayBuffer), numThreads = 1
// evita travamentos e warnings no iOS/Android e garante máxima estabilidade WASM SIMD.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.simd = true;

// Flag de debug — reduz console.logs em produção para menos jank mobile
const DEBUG = false;

function debugLog(...args: any[]) {
    if (DEBUG) console.log(...args);
}

// Prompt de contexto industrial completo do TFPM (Ponta da Madeira)
// Condiciona o decodificador do Whisper a priorizar os códigos reais do pátio
const RAILWAY_PROMPT = "Linha 65B, 01, 02, 128, 151, 152, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 170, 171, 172, 173, 175, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 104, 105A, 105B, 106A, 106B, 107A, 107B, 109, 109A, 110, 121, 122, 201, 201A, 201B, 202, 21A, 22A, 23A, 24, 25, 26, 27, 28, 29, 30, 31, 32, P13A, P13B, P14, P15A, P15B, P16, P17, TP01, TP2A, TP2B, TP3A, TP3B, TP04, TP05, 2X5, SB, oficina, pial, freio, reclassificação, carga geral, passageiro, onde estou.";

class WhisperWorker {
    static instance: any = null;
    static isWarmedUp = false;

    static async getInstance(progress_callback: any = null) {
        if (this.instance === null) {
            console.log("⚡ [Whisper Worker] Construindo Pipeline ASR Offline...");
            try {
                const modelName = 'onnx-community/whisper-tiny';
                
                const tokenizer = await AutoTokenizer.from_pretrained(modelName, { progress_callback });
                const processor = await AutoProcessor.from_pretrained(modelName, { progress_callback });
                
                // dtype 'q8' (INT8) é obrigatório e ideal para WASM SIMD offline
                const model = await AutoModelForSpeechSeq2Seq.from_pretrained(modelName, { 
                    dtype: 'q8',
                    device: 'wasm',
                    progress_callback 
                });

                this.instance = new AutomaticSpeechRecognitionPipeline({ 
                    tokenizer, 
                    processor, 
                    model,
                    task: 'transcribe'
                } as any);
                
                // Warm-up silencioso (0.5s) para pré-compilar shaders/grafos WASM ONNX
                // Elimina a demora na primeira vez que o operador aperta o microfone
                if (!this.isWarmedUp) {
                    this.isWarmedUp = true;
                    try {
                        const dummyAudio = new Float32Array(8000); // 0.5s a 16kHz
                        await this.instance(dummyAudio, {
                            language: 'portuguese',
                            task: 'transcribe',
                            max_new_tokens: 2,
                            do_sample: false,
                            num_beams: 1,
                        });
                        console.log("🔥 [Whisper Worker] Warm-up do motor neural concluído!");
                    } catch (_) {}
                }

                console.log("✅ [Whisper Worker] Pipeline 100% pronto para uso offline!");
            } catch (err) {
                console.error("🔴 [Whisper Worker] ERRO FATAL AO CARREGAR:", err);
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

// Detecta loops de repetição (ex: "2, 1, 2, 1, 2, 1...")
function isRepetitionLoop(text: string): boolean {
    const clean = text.replace(/[\s.,;!?]+/g, '');
    for (let len = 1; len <= 6; len++) {
        if (clean.length < len * 4) continue;
        const pattern = clean.substring(0, len);
        const repeated = pattern.repeat(Math.ceil(clean.length / len)).substring(0, clean.length);
        let matches = 0;
        for (let i = 0; i < clean.length; i++) {
            if (clean[i] === repeated[i]) matches++;
        }
        if (matches / clean.length > 0.8) return true;
    }
    return false;
}

// Comprimento máximo razoável para comandos de voz (suporta códigos e comandos "De X para Y")
const MAX_TRANSCRIPT_LENGTH = 55;

// Palavras que indicam alucinação de frase coloquial de filmes/legendas do Whisper
// ATENÇÃO: NÃO incluir "estou", "onde", "qual", "minha", "aqui" pois fazem parte do comando legítimo "Onde estou?" / "Qual linha?"
const PORTUGUESE_HALLUCINATION_WORDS = [
    'você pode', 'voce pode', 'quando', 'porque',
    'fazer', 'feito', 'temos', 'queria',
    'não pode', 'é isso', 'sendo', 'portanto', 'porém',
    'esses', 'essas', 'nosso', 'nossa',
    'eles', 'elas', 'dele', 'dela', 'deles', 'delas',
    'muito obrigado', 'sempre', 'nunca', 'ainda',
    'anos', 'meses', 'dias', 'horas', 'inscreva-se', 'canal',
];

function isNaturalLanguageSentence(text: string): boolean {
    const lower = text.toLowerCase();
    return PORTUGUESE_HALLUCINATION_WORDS.some(word => lower.includes(word));
}

/**
 * Normaliza o pico de volume do áudio para 0.90 antes de alimentar a rede neural.
 * Garante que mesmo se o operador falar longe do microfone ou em ambiente com vento/ruído,
 * a assinatura espectral chegue com amplitude perfeita ao Whisper.
 */
function normalizeAudioPeak(audio: Float32Array): Float32Array {
    let maxAbs = 0;
    for (let i = 0; i < audio.length; i++) {
        const abs = Math.abs(audio[i]);
        if (abs > maxAbs) maxAbs = abs;
    }
    if (maxAbs > 0.01 && maxAbs < 0.85) {
        const scale = 0.90 / maxAbs;
        const cappedScale = Math.min(scale, 5.0); // Evita explodir ruído de fundo puro
        for (let i = 0; i < audio.length; i++) {
            audio[i] = Math.max(-1, Math.min(1, audio[i] * cappedScale));
        }
    }
    return audio;
}

self.onmessage = async (event) => {
    const { type, audio, language } = event.data;

    if (type === 'PRELOAD') {
        try {
            await WhisperWorker.getInstance((progress: any) => {
                self.postMessage({ 
                    type: 'PRELOAD_PROGRESS', 
                    file: progress.file,
                    progress: progress.progress || 100,
                    status: progress.status
                });
            });
            self.postMessage({ type: 'PRELOAD_DONE' });
        } catch (error: any) {
            self.postMessage({ type: 'PRELOAD_ERROR', error: error.message });
        }
        return;
    }

    if (!audio) return;

    // Cálculo de energia para filtrar silêncio
    let sum = 0;
    for (let i = 0; i < audio.length; i++) {
        sum += audio[i] * audio[i];
    }
    const energy = Math.sqrt(sum / audio.length);
    debugLog(`⚡ [Whisper Worker] Recebidos ${audio.length} samples. Energia RMS: ${energy.toFixed(6)}`);

    // Filtro de energia mínima: se o áudio é puro silêncio/ruído, não processar
    if (energy < 0.004) {
        debugLog(`⚡ [Whisper Worker] Energia muito baixa (${energy.toFixed(6)}), descartando.`);
        self.postMessage({ type: 'RESULT', text: '' });
        return;
    }

    try {
        const transcriber = await WhisperWorker.getInstance((progress: any) => {
            if (progress.status === 'progress') {
                self.postMessage({ type: 'STATUS', status: 'loading', progress: progress.progress });
            }
        });

        self.postMessage({ type: 'STATUS', status: 'processing' });

        // Normalizar amplitude do sinal de voz
        const normalizedAudio = normalizeAudioPeak(audio);

        const startTime = performance.now();
        
        // Geração via Pipeline (ASR) otimizada para comandos curtos ferroviários
        const output = await transcriber(normalizedAudio, {
            language: language || 'portuguese',
            task: 'transcribe',
            chunk_length_s: 15,
            stride_length_s: 2,
            return_timestamps: false,
            max_new_tokens: 24,
            repetition_penalty: 1.5,
            no_repeat_ngram_size: 3,
            do_sample: false,
            num_beams: 1,
            generate_kwargs: {
                initial_prompt: RAILWAY_PROMPT
            }
        });

        const transcript = (output?.text || '').trim();
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        
        debugLog(`✅ [Whisper Worker] Resultado bruto (${duration}s): "${transcript}"`);

        const isHallucination = HALLUCINATION_PATTERNS.some(pattern => pattern.test(transcript));
        const isLoop = isRepetitionLoop(transcript);
        const isTooLong = transcript.length > MAX_TRANSCRIPT_LENGTH;
        const isNaturalLanguage = isNaturalLanguageSentence(transcript);
        
        if (isHallucination || isLoop || isTooLong || isNaturalLanguage || transcript.length < 1) {
            console.warn(`⚠️ [Whisper Worker] Alucinação filtrada: "${transcript.substring(0, 60)}"`);
            self.postMessage({ type: 'RESULT', text: '' });
        } else {
            console.log(`✅ [Whisper Worker] Transcrição Offline: "${transcript}" (${duration}s)`);
            self.postMessage({ type: 'RESULT', text: transcript });
        }

        if (output) output.text = null;

    } catch (error: any) {
        console.error("❌ [Whisper Worker] Erro:", error);
        self.postMessage({ type: 'ERROR', error: error.message });
    }
};

