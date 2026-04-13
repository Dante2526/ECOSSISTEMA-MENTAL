import { useState, useCallback, useRef, useEffect } from 'react';

interface WhisperRecognitionOptions {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
    onResult?: (transcript: string) => void;
    shouldPreload?: boolean; // Lazy: só pré-carrega quando necessário
}

// --- Constantes de Performance ---
const IS_MOBILE = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const MAX_RECORDING_MS = IS_MOBILE ? 15000 : 12000;
const BASE_THRESHOLD = 0.035;
const AUTO_STOP_MS = IS_MOBILE ? 3500 : 2500;
const CALIBRATION_FRAMES = IS_MOBILE ? 10 : 5;
const MOBILE_GAIN = 3.5;   // Ajustado para 3.5 para equilíbrio ideal em mobile
const DESKTOP_GAIN = 4.5;
const BUFFER_SIZE = 2048;
// Pré-aloca buffer máximo: 15s * 16kHz = 240.000 samples (960KB estático)
const MAX_SAMPLES = 15 * 16000;
const COMPRESSOR_THRESHOLD = -18; // dB — menos agressivo que -24
const COMPRESSOR_RATIO = 6;       // Reduzido de 12:1 para 6:1 — áudio mais natural
const PROCESSING_TIMEOUT_MS = 30000;
const MIN_AUDIO_ENERGY = 0.01;

const DEBUG = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

function debugLog(...args: any[]) {
    if (DEBUG) console.log(...args);
}

export const useWhisperRecognition = ({ onStart, onEnd, onError, onResult, shouldPreload = true }: WhisperRecognitionOptions) => {
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoadingModel, setIsLoadingModel] = useState(false);
    const [modelLoadProgress, setModelLoadProgress] = useState(0);
    
    const workerRef = useRef<Worker | null>(null);
    // AudioContext persistente — reutilizado entre gravações
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    // Nodes de pipeline (reutilizáveis)
    const pipelineNodesRef = useRef<{
        source: MediaStreamAudioSourceNode;
        hpFilter: BiquadFilterNode;
        lpFilter: BiquadFilterNode;
        gainNode: GainNode;
        compressor: DynamicsCompressorNode;
    } | null>(null);

    // Buffer pré-alocado para evitar GC thrashing
    const audioBufferRef = useRef<Float32Array>(new Float32Array(MAX_SAMPLES));
    const audioBufferOffsetRef = useRef(0);

    const callbacksRef = useRef({ onStart, onEnd, onError, onResult });
    const processingTimeoutRef = useRef<number | null>(null);
    const modelPreloadedRef = useRef(false);

    useEffect(() => {
        callbacksRef.current = { onStart, onEnd, onError, onResult };
    }, [onStart, onEnd, onError, onResult]);

    // Inicializar Worker (sempre — é leve, ~1KB)
    useEffect(() => {
        debugLog("⚡ [Whisper Hook] Inicializando worker de voz...");
        workerRef.current = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
            type: 'module'
        });

        workerRef.current.onmessage = (event) => {
            const { type, text, error, status, progress } = event.data;

            if (type === 'STATUS') {
                if (status === 'loading') {
                    setIsLoadingModel(true);
                    if (typeof progress === 'number') {
                        setModelLoadProgress(Math.round(progress));
                    }
                } else if (status === 'processing') {
                    setIsLoadingModel(false);
                    setIsProcessing(true);
                }
            } else if (type === 'PRELOAD_PROGRESS') {
                setIsLoadingModel(true);
                if (typeof event.data.progress === 'number') {
                    setModelLoadProgress(Math.round(event.data.progress));
                }
            } else if (type === 'PRELOAD_DONE') {
                setIsLoadingModel(false);
                setModelLoadProgress(100);
                modelPreloadedRef.current = true;
                console.log("✅ [Whisper Hook] Modelo pré-carregado com sucesso!");
            } else if (type === 'PRELOAD_ERROR') {
                setIsLoadingModel(false);
                console.error("❌ [Whisper Hook] Erro ao pré-carregar modelo:", error || event.data.error);
            } else if (type === 'RESULT') {
                if (processingTimeoutRef.current) {
                    clearTimeout(processingTimeoutRef.current);
                    processingTimeoutRef.current = null;
                }
                setIsProcessing(false);
                setIsLoadingModel(false);
                debugLog("------------------------------------------");
                debugLog("🎤 WHISPER TRANSCRIPTION:", text);
                debugLog("------------------------------------------");
                if (text && text.trim().length > 0) {
                    callbacksRef.current.onResult?.(text);
                }
                callbacksRef.current.onEnd?.();
            } else if (type === 'ERROR') {
                if (processingTimeoutRef.current) {
                    clearTimeout(processingTimeoutRef.current);
                    processingTimeoutRef.current = null;
                }
                setIsProcessing(false);
                setIsLoadingModel(false);
                console.error("⚡ [Whisper Hook] Erro no worker:", error);
                callbacksRef.current.onError?.(error);
                callbacksRef.current.onEnd?.();
            }
        };

        return () => {
            debugLog("⚡ [Whisper Hook] Terminando worker.");
            workerRef.current?.terminate();
        };
    }, []);

    // Pré-carregar modelo Whisper — APENAS se shouldPreload = true (offline)
    useEffect(() => {
        if (shouldPreload && !modelPreloadedRef.current && workerRef.current) {
            debugLog("⚡ [Whisper Hook] Solicitando pré-carregamento do modelo Whisper...");
            workerRef.current.postMessage({ type: 'PRELOAD' });
        }
    }, [shouldPreload]);

    const isListeningRef = useRef(false);
    const isStoppingRef = useRef(false);

    // --- Variáveis de detecção de silêncio (compartilhadas via refs) ---
    const silenceStartTimeRef = useRef(0);
    const hasSpeechStartedRef = useRef(false);
    const smoothedRmsRef = useRef(0);
    const noiseFloorRef = useRef(0.01);
    const framesAnalyzedRef = useRef(0);
    const energyVarianceRef = useRef(0);
    const startTimeRef = useRef(0);

    /**
     * Desconecta os nós de pipeline do AudioContext sem destruí-lo.
     * Permite reutilização rápida na próxima gravação.
     */
    const disconnectPipeline = useCallback(() => {
        if (workletNodeRef.current) {
            workletNodeRef.current.port.onmessage = null;
            try { workletNodeRef.current.disconnect(); } catch (_) {}
            workletNodeRef.current = null;
        }
        if (pipelineNodesRef.current) {
            const { source, hpFilter, lpFilter, gainNode, compressor } = pipelineNodesRef.current;
            try { source.disconnect(); } catch (_) {}
            try { hpFilter.disconnect(); } catch (_) {}
            try { lpFilter.disconnect(); } catch (_) {}
            try { gainNode.disconnect(); } catch (_) {}
            try { compressor.disconnect(); } catch (_) {}
            pipelineNodesRef.current = null;
        }
    }, []);

    const stop = useCallback(async () => {
        if (!isListeningRef.current || isStoppingRef.current) {
            return;
        }
        
        isStoppingRef.current = true;
        isListeningRef.current = false;
        setIsListening(false);

        debugLog("⚡ [Whisper Hook] Parando gravação e enviando para processamento...");

        // Desconectar pipeline (mas manter AudioContext vivo)
        disconnectPipeline();
        
        // Parar tracks do microfone (libera hardware)
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // NÃO fechar o AudioContext — será reutilizado
        // Apenas suspender se quisermos economizar CPU
        if (audioContextRef.current && audioContextRef.current.state === 'running') {
            try {
                await audioContextRef.current.suspend();
            } catch (_) {}
        }

        const samplesRecorded = audioBufferOffsetRef.current;

        if (samplesRecorded > 0 && hasSpeechStartedRef.current) {
            // Copiar apenas a porção preenchida do buffer (não o buffer inteiro)
            const mergedArray = audioBufferRef.current.slice(0, samplesRecorded);

            // Enviar direto ao worker — ele calcula a energia
            debugLog(`⚡ [Whisper Hook] Enviando ${mergedArray.length} samples para o worker.`);
            
            // Timeout de segurança
            if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = window.setTimeout(() => {
                console.error("⚡ [Whisper Hook] Timeout de processamento atingido.");
                setIsProcessing(false);
                setIsLoadingModel(false);
                callbacksRef.current.onError?.("timeout");
                callbacksRef.current.onEnd?.();
            }, PROCESSING_TIMEOUT_MS);

            workerRef.current?.postMessage({
                audio: mergedArray,
                language: 'portuguese'
            });
        } else {
            if (!hasSpeechStartedRef.current) {
                debugLog("⚡ [Whisper Hook] Nenhuma fala detectada durante a gravação.");
                callbacksRef.current.onError?.('no-speech');
            } else {
                debugLog("⚡ [Whisper Hook] Nenhum áudio capturado para processar.");
            }
            callbacksRef.current.onEnd?.();
        }

        // Reset offset do buffer (o buffer em si é reutilizado)
        audioBufferOffsetRef.current = 0;
    }, [disconnectPipeline]);

    /**
     * Processa dados de áudio recebidos do AudioWorklet ou ScriptProcessor.
     * Lógica unificada de detecção de voz e silêncio.
     * Usa buffer pré-alocado em vez de push em array (evita GC).
     */
    const processAudioFrame = useCallback((audioData: Float32Array, rms: number) => {
        if (isStoppingRef.current) return;
        
        if (Date.now() - startTimeRef.current > MAX_RECORDING_MS) {
            debugLog("⚡ [Whisper Hook] Timeout máximo atingido.");
            stop();
            return;
        }

        // Suavização adaptativa
        smoothedRmsRef.current = (smoothedRmsRef.current * 0.7) + (rms * 0.3);
        framesAnalyzedRef.current++;

        if (framesAnalyzedRef.current < CALIBRATION_FRAMES) {
            noiseFloorRef.current = Math.max(noiseFloorRef.current, smoothedRmsRef.current);
            return;
        }

        energyVarianceRef.current = Math.abs(rms - smoothedRmsRef.current);
        
        // Threshold dinâmico
        const dynamicThreshold = Math.max(BASE_THRESHOLD, noiseFloorRef.current * 1.8);

        if (!hasSpeechStartedRef.current) {
            if (smoothedRmsRef.current > dynamicThreshold && energyVarianceRef.current > (dynamicThreshold * 0.3)) {
                hasSpeechStartedRef.current = true;
                debugLog(`🎤 [Whisper Hook] Voz detectada! RMS: ${smoothedRmsRef.current.toFixed(4)} | Threshold: ${dynamicThreshold.toFixed(4)}`);
            }
        }

        if (hasSpeechStartedRef.current) {
            const isSilent = smoothedRmsRef.current < (dynamicThreshold * 0.85) || energyVarianceRef.current < (dynamicThreshold * 0.1);
            
            // Copiar para buffer pré-alocado (sem criar novo Float32Array)
            const offset = audioBufferOffsetRef.current;
            const spaceLeft = MAX_SAMPLES - offset;
            const copyLen = Math.min(audioData.length, spaceLeft);
            
            if (copyLen > 0) {
                audioBufferRef.current.set(audioData.subarray(0, copyLen), offset);
                audioBufferOffsetRef.current = offset + copyLen;
            }

            if (spaceLeft <= 0) {
                debugLog("⚡ [Whisper Hook] Buffer cheio, parando gravação.");
                stop();
                return;
            }
            
            if (isSilent) {
                if (silenceStartTimeRef.current === 0) silenceStartTimeRef.current = Date.now();
                const silenceDuration = Date.now() - silenceStartTimeRef.current;
                if (silenceDuration > AUTO_STOP_MS) {
                    debugLog(`⚡ [Whisper Hook] Silêncio detectado atingiu timeout.`);
                    stop();
                }
            } else {
                silenceStartTimeRef.current = 0;
                if (rms < dynamicThreshold && rms > noiseFloorRef.current) {
                    noiseFloorRef.current = (noiseFloorRef.current * 0.95) + (rms * 0.05);
                }
            }
        }
    }, [stop]);

    /**
     * Tenta iniciar com AudioWorklet (thread dedicada, melhor para mobile).
     * Retorna true se bem-sucedido, false se não suportado.
     */
    const tryAudioWorklet = async (
        audioContext: AudioContext,
        source: MediaStreamAudioSourceNode,
        gainNode: GainNode,
        compressor: DynamicsCompressorNode,
        hpFilter: BiquadFilterNode,
        lpFilter: BiquadFilterNode
    ): Promise<boolean> => {
        try {
            // Criar um blob URL com o código do worklet inline
            // (para evitar problemas de CORS e caminhos em PWA)
            const workletCode = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(${BUFFER_SIZE});
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const channelData = input[0];

        for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex++] = channelData[i];

            if (this.bufferIndex >= ${BUFFER_SIZE}) {
                let sum = 0;
                for (let j = 0; j < ${BUFFER_SIZE}; j++) {
                    sum += this.buffer[j] * this.buffer[j];
                }
                const rms = Math.sqrt(sum / ${BUFFER_SIZE});

                this.port.postMessage({
                    type: 'AUDIO_DATA',
                    audioData: this.buffer.slice(),
                    rms: rms
                });

                this.bufferIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
`;
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            const workletUrl = URL.createObjectURL(blob);

            await audioContext.audioWorklet.addModule(workletUrl);
            URL.revokeObjectURL(workletUrl);

            const workletNode = new AudioWorkletNode(audioContext, 'audio-capture-processor');
            workletNodeRef.current = workletNode;

            // Receber dados do worklet
            workletNode.port.onmessage = (event) => {
                if (event.data.type === 'AUDIO_DATA') {
                    processAudioFrame(event.data.audioData, event.data.rms);
                }
            };

            // Conectando: Source -> HP -> LP -> Gain -> Compressor -> Worklet
            source.connect(hpFilter);
            hpFilter.connect(lpFilter);
            lpFilter.connect(gainNode);
            gainNode.connect(compressor);
            compressor.connect(workletNode);
            // AudioWorklet não precisa conectar ao destination (silêncio ao speaker)

            debugLog("✅ [Whisper Hook] AudioWorklet inicializado com sucesso!");
            return true;
        } catch (err) {
            console.warn("⚠️ [Whisper Hook] AudioWorklet não disponível, usando fallback:", err);
            return false;
        }
    };

    /**
     * Fallback: usa ScriptProcessor quando AudioWorklet não está disponível.
     * CORRIGIDO: Não conecta ao destination real para evitar eco/feedback.
     */
    const useScriptProcessorFallback = (
        audioContext: AudioContext,
        source: MediaStreamAudioSourceNode,
        gainNode: GainNode,
        compressor: DynamicsCompressorNode,
        hpFilter: BiquadFilterNode,
        lpFilter: BiquadFilterNode
    ): void => {
        const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

        processor.onaudioprocess = (e) => {
            if (isStoppingRef.current) return;

            const inputData = e.inputBuffer.getChannelData(0);
            
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);

            processAudioFrame(new Float32Array(inputData), rms);
        };

        // Conectando: Source -> HP -> LP -> Gain -> Compressor -> Processor
        source.connect(hpFilter);
        hpFilter.connect(lpFilter);
        lpFilter.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(processor);
        
        // CORRIGIDO: usar MediaStreamDestination em vez de destination real
        // Evita eco no speaker enquanto mantém o ScriptProcessor ativo
        const silentDest = audioContext.createMediaStreamDestination();
        processor.connect(silentDest);

        console.warn("⚠️ [Whisper Hook] Usando ScriptProcessor (fallback) — sem eco.");
    };

    const start = useCallback(async () => {
        if (isListening || isProcessing || isLoadingModel) return;
        isStoppingRef.current = false;

        // Reset das variáveis de detecção
        silenceStartTimeRef.current = 0;
        hasSpeechStartedRef.current = false;
        smoothedRmsRef.current = 0;
        noiseFloorRef.current = 0.01;
        framesAnalyzedRef.current = 0;
        energyVarianceRef.current = 0;
        startTimeRef.current = Date.now();
        audioBufferOffsetRef.current = 0;

        try {
            debugLog("⚡ [Whisper Hook] Iniciando captura de áudio...");
            debugLog(`📱 [Whisper Hook] Modo: ${IS_MOBILE ? 'MOBILE' : 'DESKTOP'}`);

            // Configurações de áudio otimizadas
            const audioConstraints: MediaTrackConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
            };

            // Nem todos os dispositivos mobile suportam sampleRate constraint
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: audioConstraints
            });
            streamRef.current = stream;

            // Reutilizar AudioContext se possível
            let audioContext = audioContextRef.current;
            
            if (!audioContext || audioContext.state === 'closed') {
                // Corrigido: Forçar 16000Hz sempre. O Whisper exige 16kHz.
                audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                    sampleRate: 16000
                });
                audioContextRef.current = audioContext;
                debugLog("🔊 [Whisper Hook] Novo AudioContext criado a 16kHz.");
            }
            
            // Resume se suspenso (necessário tanto para reutilização quanto para iOS/Android)
            if (audioContext.state === 'suspended') {
                debugLog("⚡ [Whisper Hook] AudioContext suspenso, fazendo resume...");
                await audioContext.resume();
                debugLog("✅ [Whisper Hook] AudioContext resumido:", audioContext.state);
            }

            debugLog(`🔊 [Whisper Hook] SampleRate efetivo: ${audioContext.sampleRate}Hz`);
            
            const source = audioContext.createMediaStreamSource(stream);
            
            // Cadeia de Filtros (Passa-Banda: 300Hz a 3500Hz)
            const hpFilter = audioContext.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = 300;
            hpFilter.Q.value = 0.7;

            const lpFilter = audioContext.createBiquadFilter();
            lpFilter.type = 'lowpass';
            lpFilter.frequency.value = 3500;
            lpFilter.Q.value = 0.7;
            
            // Pré-amplificador (Ganho Adaptativo — REDUZIDO para mobile)
            const gainNode = audioContext.createGain();
            gainNode.gain.value = IS_MOBILE ? MOBILE_GAIN : DESKTOP_GAIN;
            
            // Compressor (Normaliza o volume da voz — MENOS AGRESSIVO)
            const compressor = audioContext.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(COMPRESSOR_THRESHOLD, audioContext.currentTime);
            compressor.knee.setValueAtTime(30, audioContext.currentTime);
            compressor.ratio.setValueAtTime(COMPRESSOR_RATIO, audioContext.currentTime);
            compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
            compressor.release.setValueAtTime(0.25, audioContext.currentTime);

            // Guardar referências dos nós para desconexão limpa
            pipelineNodesRef.current = { source, hpFilter, lpFilter, gainNode, compressor };

            // Tentar AudioWorklet primeiro (melhor para mobile), fallback para ScriptProcessor
            const workletSuccess = await tryAudioWorklet(
                audioContext, source, gainNode, compressor, hpFilter, lpFilter
            );

            if (!workletSuccess) {
                useScriptProcessorFallback(
                    audioContext, source, gainNode, compressor, hpFilter, lpFilter
                );
            }

            setIsListening(true);
            isListeningRef.current = true;
            callbacksRef.current.onStart?.();

        } catch (err: any) {
            console.error('❌ [Whisper Hook] Erro ao acessar microfone:', err);
            callbacksRef.current.onError?.(err.name === 'NotAllowedError' ? 'not-allowed' : 'mic-error');
        }
    }, [isListening, isProcessing, isLoadingModel, stop, processAudioFrame, disconnectPipeline]);

    // Cleanup: fechar AudioContext ao desmontar
    useEffect(() => {
        return () => {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(() => {});
            }
        };
    }, []);

    return { isListening, isProcessing, isLoadingModel, modelLoadProgress, start, stop };
};
