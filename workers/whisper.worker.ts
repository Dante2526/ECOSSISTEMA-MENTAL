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

// Define explicitamente o caminho do WASM via CDN para evitar que o Vite/Terser corrompa o arquivo no build de produção
// Erro evitado: _OrtGetInputOutputMetadata is not a function
env.backends.onnx.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${env.version}/dist/`;

// Flag de debug — reduz console.logs em produção para menos jank mobile
const DEBUG = false;

function debugLog(...args: any[]) {
    if (DEBUG) console.log(...args);
}

class WhisperWorker {
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            console.log("⚡ [Whisper Worker] Construindo Pipeline ASR manualmente...");
            try {
                const modelName = 'onnx-community/whisper-tiny';
                
                console.log("⏳ [1/3] Carregando Tokenizer...");
                const tokenizer = await AutoTokenizer.from_pretrained(modelName, { progress_callback });
                
                console.log("⏳ [2/3] Carregando Processor...");
                const processor = await AutoProcessor.from_pretrained(modelName, { progress_callback });
                
                console.log("⏳ [3/3] Carregando Modelo Seq2Seq (ONNX q8)...");
                // IMPORTANTE: dtype 'q8' (INT8) é obrigatório para WASM.
                // O padrão do onnx-community usa 4-bit (MatMulNBits) que NÃO funciona no ONNX Runtime WASM.
                const model = await AutoModelForSpeechSeq2Seq.from_pretrained(modelName, { 
                    dtype: 'q8',
                    device: 'wasm',
                    progress_callback 
                });

                console.log("🧠 [Whisper Worker] Instanciando Pipeline...");
                this.instance = new AutomaticSpeechRecognitionPipeline({ 
                    tokenizer, 
                    processor, 
                    model,
                    task: 'transcribe'
                } as any);
                
                console.log("✅ [Whisper Worker] Pipeline carregado com sucesso!");
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
    // Remove espaços e pontuação para análise
    const clean = text.replace(/[\s.,;!?]+/g, '');
    // Testa padrões repetitivos de 1-6 chars
    for (let len = 1; len <= 6; len++) {
        if (clean.length < len * 4) continue; // Precisa de pelo menos 4 repetições
        const pattern = clean.substring(0, len);
        const repeated = pattern.repeat(Math.ceil(clean.length / len)).substring(0, clean.length);
        // Se >80% dos caracteres formam uma repetição, é alucinação
        let matches = 0;
        for (let i = 0; i < clean.length; i++) {
            if (clean[i] === repeated[i]) matches++;
        }
        if (matches / clean.length > 0.8) return true;
    }
    return false;
}

// Comprimento máximo razoável para transcrição de código industrial
// O maior código legítimo tem ~20 chars (ex: "dois zero um b")
const MAX_TRANSCRIPT_LENGTH = 40;

// Palavras que indicam frase em português natural — jamais são parte de um código industrial
const PORTUGUESE_SENTENCE_WORDS = [
    'você', 'voce', 'pode', 'isso', 'aqui', 'quando', 'porque', 'como',
    'fazer', 'feito', 'estou', 'está', 'temos', 'quero', 'queria',
    'não pode', 'é isso', 'sendo', 'então', 'portanto', 'porém',
    'esses', 'esse', 'essa', 'essas', 'minha', 'nosso', 'nossa',
    'eles', 'elas', 'dele', 'dela', 'deles', 'delas',
    'muito', 'pouco', 'sempre', 'nunca', 'ainda', 'agora',
    'anos', 'meses', 'dias', 'horas',
];

function isNaturalLanguageSentence(text: string): boolean {
    const lower = text.toLowerCase();
    // Se contém alguma palavra-gatilho de frase natural, é alucinação
    return PORTUGUESE_SENTENCE_WORDS.some(word => lower.includes(word));
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
        // v3: parâmetros de geração são TOP-LEVEL, prompt vai em generate_kwargs
        const output = await transcriber(audio, {
            language: language || 'portuguese',
            task: 'transcribe',
            chunk_length_s: 15, // Otimizado para áudio curto (códigos industriais)
            stride_length_s: 3,
            return_timestamps: false,
            // Parâmetros de geração — TOP-LEVEL para v3
            max_new_tokens: 20,
            repetition_penalty: 1.8,
            no_repeat_ngram_size: 3,
            do_sample: false,
            num_beams: 1,
            // Prompt de contexto — informa ao Whisper que são códigos industriais
            generate_kwargs: {
                initial_prompt: "Código 201-B, linha 161, 162, 163, 164, 165, 166, 167, 187, 151, 175, 176, 177, 178, 179, 180, 181, 182, 202, estação, pial."
            }
        });

        const transcript = output.text.trim();
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        
        debugLog(`✅ [Whisper Worker] Resultado bruto (${duration}s): "${transcript}"`);

        const isHallucination = HALLUCINATION_PATTERNS.some(pattern => pattern.test(transcript));
        const isLoop = isRepetitionLoop(transcript);
        const isTooLong = transcript.length > MAX_TRANSCRIPT_LENGTH;
        const isNaturalLanguage = isNaturalLanguageSentence(transcript);
        
        if (isHallucination || isLoop || isTooLong || isNaturalLanguage || transcript.length < 2) {
            console.warn(`⚠️ [Whisper Worker] Alucinação filtrada (padrão=${isHallucination}, loop=${isLoop}, longo=${isTooLong}, frase=${isNaturalLanguage}): "${transcript.substring(0, 60)}"`);
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
