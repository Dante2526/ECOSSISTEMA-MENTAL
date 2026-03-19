import { useState, useCallback, useRef, useEffect } from 'react';

interface WhisperRecognitionOptions {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
    onResult?: (transcript: string) => void;
}

export const useWhisperRecognition = ({ onStart, onEnd, onError, onResult }: WhisperRecognitionOptions) => {
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoadingModel, setIsLoadingModel] = useState(false);
    const [modelLoadProgress, setModelLoadProgress] = useState(0);
    
    const workerRef = useRef<Worker | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Float32Array[]>([]);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);

    const callbacksRef = useRef({ onStart, onEnd, onError, onResult });
    const processingTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        callbacksRef.current = { onStart, onEnd, onError, onResult };
    }, [onStart, onEnd, onError, onResult]);

    // Inicializar Worker
    useEffect(() => {
        console.log("⚡ [Whisper Hook] Inicializando worker de voz...");
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
                console.log("------------------------------------------");
                console.log("🎤 WHISPER TRANSCRIPTION:", text);
                console.log("------------------------------------------");
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

        // Pré-carregar modelo Whisper na inicialização
        console.log("⚡ [Whisper Hook] Solicitando pré-carregamento do modelo Whisper...");
        workerRef.current.postMessage({ type: 'PRELOAD' });

        return () => {
            console.log("⚡ [Whisper Hook] Terminando worker.");
            workerRef.current?.terminate();
        };
    }, []);

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
    const isMobileRef = useRef(false);

    const stop = useCallback(async () => {
        if (!isListeningRef.current || isStoppingRef.current) {
            return;
        }
        
        isStoppingRef.current = true;
        isListeningRef.current = false;
        setIsListening(false);

        console.log("⚡ [Whisper Hook] Parando gravação e enviando para processamento...");

        // Desconectar o worklet node
        if (workletNodeRef.current) {
            workletNodeRef.current.port.onmessage = null;
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (audioContextRef.current) {
            try {
                if (audioContextRef.current.state !== 'closed') {
                    await audioContextRef.current.close();
                }
            } catch (e) {
                console.error("⚡ [Whisper Hook] Erro ao fechar AudioContext:", e);
            }
            audioContextRef.current = null;
        }

        if (audioChunksRef.current.length > 0 && hasSpeechStartedRef.current) {
            const totalLength = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
            const mergedArray = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunksRef.current) {
                mergedArray.set(chunk, offset);
                offset += chunk.length;
            }

            // Verificar energia mínima antes de enviar ao worker
            let energySum = 0;
            for (let i = 0; i < mergedArray.length; i++) {
                energySum += mergedArray[i] * mergedArray[i];
            }
            const audioEnergy = Math.sqrt(energySum / mergedArray.length);

            if (audioEnergy < 0.01) {
                console.warn(`⚡ [Whisper Hook] Energia muito baixa (${audioEnergy.toFixed(6)}), descartando áudio silencioso.`);
                callbacksRef.current.onError?.('no-speech');
                callbacksRef.current.onEnd?.();
            } else {
                console.log(`⚡ [Whisper Hook] Enviando ${mergedArray.length} samples (energia: ${audioEnergy.toFixed(4)}) para o worker.`);
                
                // Timeout de segurança: 30 segundos para processar (aumentado para mobile)
                if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
                processingTimeoutRef.current = window.setTimeout(() => {
                    console.error("⚡ [Whisper Hook] Timeout de processamento atingido.");
                    setIsProcessing(false);
                    setIsLoadingModel(false);
                    callbacksRef.current.onError?.("timeout");
                    callbacksRef.current.onEnd?.();
                }, 30000);

                workerRef.current?.postMessage({
                    audio: mergedArray,
                    language: 'portuguese'
                });
            }
        } else {
            if (!hasSpeechStartedRef.current) {
                console.warn("⚡ [Whisper Hook] Nenhuma fala detectada durante a gravação.");
                callbacksRef.current.onError?.('no-speech');
            } else {
                console.warn("⚡ [Whisper Hook] Nenhum áudio capturado para processar.");
            }
            callbacksRef.current.onEnd?.();
        }

        audioChunksRef.current = [];
    }, []);

    /**
     * Processa dados de áudio recebidos do AudioWorklet ou ScriptProcessor.
     * Lógica unificada de detecção de voz e silêncio.
     */
    const processAudioFrame = useCallback((audioData: Float32Array, rms: number) => {
        if (isStoppingRef.current) return;

        const isMobile = isMobileRef.current;
        const MAX_RECORDING_MS = isMobile ? 15000 : 12000;
        const BASE_THRESHOLD = isMobile ? 0.035 : 0.035;
        const AUTO_STOP_MS = isMobile ? 3500 : 2500;
        const CALIBRATION_FRAMES = isMobile ? 10 : 5;
        
        if (Date.now() - startTimeRef.current > MAX_RECORDING_MS) {
            console.log("⚡ [Whisper Hook] Timeout máximo atingido.");
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
                console.log(`🎤 [Whisper Hook] Voz detectada! RMS: ${smoothedRmsRef.current.toFixed(4)} | Threshold: ${dynamicThreshold.toFixed(4)}`);
            }
        }

        if (hasSpeechStartedRef.current) {
            const isSilent = smoothedRmsRef.current < (dynamicThreshold * 0.85) || energyVarianceRef.current < (dynamicThreshold * 0.1);
            
            audioChunksRef.current.push(new Float32Array(audioData));
            
            if (isSilent) {
                if (silenceStartTimeRef.current === 0) silenceStartTimeRef.current = Date.now();
                const silenceDuration = Date.now() - silenceStartTimeRef.current;
                if (silenceDuration > AUTO_STOP_MS) {
                    console.log(`⚡ [Whisper Hook] Silêncio detectado atingiu timeout.`);
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
        this.buffer = new Float32Array(2048);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const channelData = input[0];

        for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex++] = channelData[i];

            if (this.bufferIndex >= 2048) {
                let sum = 0;
                for (let j = 0; j < 2048; j++) {
                    sum += this.buffer[j] * this.buffer[j];
                }
                const rms = Math.sqrt(sum / 2048);

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

            console.log("✅ [Whisper Hook] AudioWorklet inicializado com sucesso!");
            return true;
        } catch (err) {
            console.warn("⚠️ [Whisper Hook] AudioWorklet não disponível, usando fallback:", err);
            return false;
        }
    };

    /**
     * Fallback: usa ScriptProcessor quando AudioWorklet não está disponível.
     */
    const useScriptProcessorFallback = (
        audioContext: AudioContext,
        source: MediaStreamAudioSourceNode,
        gainNode: GainNode,
        compressor: DynamicsCompressorNode,
        hpFilter: BiquadFilterNode,
        lpFilter: BiquadFilterNode
    ): void => {
        const processor = audioContext.createScriptProcessor(2048, 1, 1);

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

        // Conectando: Source -> HP -> LP -> Gain -> Compressor -> Processor -> Destination
        source.connect(hpFilter);
        hpFilter.connect(lpFilter);
        lpFilter.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(processor);
        processor.connect(audioContext.destination);

        console.log("⚠️ [Whisper Hook] Usando ScriptProcessor (fallback).");
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

        try {
            console.log("⚡ [Whisper Hook] Iniciando captura de áudio...");
            
            // Detecção de mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            isMobileRef.current = isMobile;
            console.log(`📱 [Whisper Hook] Modo: ${isMobile ? 'MOBILE' : 'DESKTOP'}`);

            // Configurações de áudio otimizadas
            const audioConstraints: MediaTrackConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
            };

            // Nem todos os dispositivos mobile suportam sampleRate constraint
            if (!isMobile) {
                (audioConstraints as any).sampleRate = 16000;
            }

            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: audioConstraints
            });
            streamRef.current = stream;

            // Criar AudioContext — usar sampleRate nativa em mobile para evitar resampling
            const contextOptions: AudioContextOptions = {};
            if (!isMobile) {
                contextOptions.sampleRate = 16000;
            }

            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(contextOptions);
            
            // ⚠️ CRÍTICO PARA MOBILE: Resume o AudioContext se estiver suspenso
            // iOS e Android exigem interação do usuário para desbloquear
            if (audioContextRef.current.state === 'suspended') {
                console.log("⚡ [Whisper Hook] AudioContext suspenso, fazendo resume...");
                await audioContextRef.current.resume();
                console.log("✅ [Whisper Hook] AudioContext resumido:", audioContextRef.current.state);
            }

            const actualSampleRate = audioContextRef.current.sampleRate;
            console.log(`🔊 [Whisper Hook] SampleRate efetivo: ${actualSampleRate}Hz`);
            
            const source = audioContextRef.current.createMediaStreamSource(stream);
            
            // Cadeia de Filtros (Passa-Banda: 300Hz a 3500Hz)
            const hpFilter = audioContextRef.current.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = 300;
            hpFilter.Q.value = 0.7;

            const lpFilter = audioContextRef.current.createBiquadFilter();
            lpFilter.type = 'lowpass';
            lpFilter.frequency.value = 3500;
            lpFilter.Q.value = 0.7;
            
            // Pré-amplificador (Ganho Adaptativo)
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = isMobile ? 6.5 : 4.5;
            
            // Compressor (Normaliza o volume da voz)
            const compressor = audioContextRef.current.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-24, audioContextRef.current.currentTime);
            compressor.knee.setValueAtTime(30, audioContextRef.current.currentTime);
            compressor.ratio.setValueAtTime(12, audioContextRef.current.currentTime);
            compressor.attack.setValueAtTime(0.003, audioContextRef.current.currentTime);
            compressor.release.setValueAtTime(0.25, audioContextRef.current.currentTime);

            audioChunksRef.current = [];

            // Tentar AudioWorklet primeiro (melhor para mobile), fallback para ScriptProcessor
            const workletSuccess = await tryAudioWorklet(
                audioContextRef.current, source, gainNode, compressor, hpFilter, lpFilter
            );

            if (!workletSuccess) {
                useScriptProcessorFallback(
                    audioContextRef.current, source, gainNode, compressor, hpFilter, lpFilter
                );
            }

            setIsListening(true);
            isListeningRef.current = true;
            callbacksRef.current.onStart?.();

        } catch (err: any) {
            console.error('❌ [Whisper Hook] Erro ao acessar microfone:', err);
            callbacksRef.current.onError?.(err.name === 'NotAllowedError' ? 'not-allowed' : 'mic-error');
        }
    }, [isListening, isProcessing, isLoadingModel, stop, processAudioFrame]);

    return { isListening, isProcessing, isLoadingModel, modelLoadProgress, start, stop };
};
