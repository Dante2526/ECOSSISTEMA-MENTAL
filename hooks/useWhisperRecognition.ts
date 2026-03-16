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
    
    const workerRef = useRef<Worker | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Float32Array[]>([]);

    const callbacksRef = useRef({ onStart, onEnd, onError, onResult });
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
            const { type, text, error, status } = event.data;

            if (type === 'STATUS') {
                if (status === 'loading') {
                    setIsLoadingModel(true);
                } else if (status === 'processing') {
                    setIsLoadingModel(false);
                    setIsProcessing(true);
                }
            } else if (type === 'RESULT') {
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
                setIsProcessing(false);
                setIsLoadingModel(false);
                console.error("⚡ [Whisper Hook] Erro no worker:", error);
                callbacksRef.current.onError?.(error);
                callbacksRef.current.onEnd?.();
            }
        };

        return () => {
            console.log("⚡ [Whisper Hook] Terminando worker.");
            workerRef.current?.terminate();
        };
    }, []);

    const isListeningRef = useRef(false);
    const isStoppingRef = useRef(false);

    const stop = useCallback(async () => {
        // Usa o Ref para evitar stale closures
        if (!isListeningRef.current || isStoppingRef.current) {
            return;
        }
        
        isStoppingRef.current = true;
        isListeningRef.current = false;
        setIsListening(false);

        console.log("⚡ [Whisper Hook] Parando gravação e enviando para processamento...");
        
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

        if (audioChunksRef.current.length > 0) {
            const totalLength = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
            const mergedArray = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunksRef.current) {
                mergedArray.set(chunk, offset);
                offset += chunk.length;
            }

            console.log(`⚡ [Whisper Hook] Enviando ${mergedArray.length} samples para o worker.`);
            workerRef.current?.postMessage({
                audio: mergedArray,
                language: 'portuguese'
            });
        } else {
            console.warn("⚡ [Whisper Hook] Nenhum áudio capturado para processar.");
            callbacksRef.current.onEnd?.();
        }

        audioChunksRef.current = [];
    }, []); // Sem dependências para ser estável

    const start = useCallback(async () => {
        if (isListening || isProcessing || isLoadingModel) return;
        isStoppingRef.current = false;

        try {
            console.log("⚡ [Whisper Hook] Iniciando captura de áudio...");
            
            // Detecção de mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            console.log(`📱 [Whisper Hook] Modo: ${isMobile ? 'MOBILE' : 'DESKTOP'}`);

            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 16000
                } 
            });
            streamRef.current = stream;

            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 16000,
            });
            
            const source = audioContextRef.current.createMediaStreamSource(stream);
            
            // 1. Cadeia de Filtros (Passa-Banda: 300Hz a 3500Hz)
            // Filtro Passa-Alta (Corta graves/vento)
            const hpFilter = audioContextRef.current.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = 300;
            hpFilter.Q.value = 0.7;

            // Filtro Passa-Baixa (Corta ruídos agudos)
            const lpFilter = audioContextRef.current.createBiquadFilter();
            lpFilter.type = 'lowpass';
            lpFilter.frequency.value = 3500;
            lpFilter.Q.value = 0.7;
            
            // 2. Pré-amplificador (Ganho Adaptativo Inicial)
            const gainNode = audioContextRef.current.createGain();
            // Mobile (S23 Ultra e outros) precisam de mais ganho devido à distância
            gainNode.gain.value = isMobile ? 6.5 : 4.5; 
            
            // 3. Compressor (Normaliza o volume da voz)
            const compressor = audioContextRef.current.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-24, audioContextRef.current.currentTime);
            compressor.knee.setValueAtTime(30, audioContextRef.current.currentTime);
            compressor.ratio.setValueAtTime(12, audioContextRef.current.currentTime);
            compressor.attack.setValueAtTime(0.003, audioContextRef.current.currentTime);
            compressor.release.setValueAtTime(0.25, audioContextRef.current.currentTime);

            const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);

            audioChunksRef.current = [];
            let silenceStartTime = 0;
            let hasSpeechStarted = false;
            let smoothedRms = 0;
            let noiseFloor = 0.01;
            let framesAnalyzed = 0;
            let energyVariance = 0;
            
            // Thresholds adaptativos
            const BASE_THRESHOLD = isMobile ? 0.040 : 0.035; 
            const AUTO_STOP_MS = 2500; 
            const MAX_RECORDING_MS = 12000; 
            const CALIBRATION_FRAMES = 5;
            const startTime = Date.now();

            processor.onaudioprocess = (e) => {
                if (isStoppingRef.current) return;
                
                if (Date.now() - startTime > MAX_RECORDING_MS) {
                    console.log("⚡ [Whisper Hook] Timeout máximo atingido.");
                    stop();
                    return;
                }

                const inputData = e.inputBuffer.getChannelData(0);
                
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                
                // Suavização adaptativa
                smoothedRms = (smoothedRms * 0.7) + (rms * 0.3);
                framesAnalyzed++;

                if (framesAnalyzed < CALIBRATION_FRAMES) {
                    noiseFloor = Math.max(noiseFloor, smoothedRms);
                    return;
                }

                energyVariance = Math.abs(rms - smoothedRms);
                
                // Threshold dinâmico: se o ruído ambiente aumentar, o gate sobe
                const dynamicThreshold = Math.max(BASE_THRESHOLD, noiseFloor * 1.8);

                if (!hasSpeechStarted) {
                    // Detecção de voz: RMS alto + Variância de energia (voz é dinâmica, ruído é fixo)
                    if (smoothedRms > dynamicThreshold && energyVariance > (dynamicThreshold * 0.3)) {
                        hasSpeechStarted = true;
                        console.log(`🎤 [Whisper Hook] Voz detectada! RMS: ${smoothedRms.toFixed(4)} | Threshold: ${dynamicThreshold.toFixed(4)}`);
                    }
                }

                if (hasSpeechStarted) {
                    // Critério de silêncio: RMS baixo OU variância muito baixa (ruído constante de ventilador)
                    const isSilent = smoothedRms < (dynamicThreshold * 0.85) || energyVariance < (dynamicThreshold * 0.1);
                    
                    audioChunksRef.current.push(new Float32Array(inputData));
                    
                    if (isSilent) {
                        if (silenceStartTime === 0) silenceStartTime = Date.now();
                        const silenceDuration = Date.now() - silenceStartTime;
                        if (silenceDuration > AUTO_STOP_MS) {
                            console.log(`⚡ [Whisper Hook] Silêncio detectado atingiu timeout.`);
                            stop();
                        }
                    } else {
                        silenceStartTime = 0;
                        // Atualiza dinamicamente o noiseFloor se houver silêncio prolongado mas abaixo do threshold
                        if (rms < dynamicThreshold && rms > noiseFloor) {
                            noiseFloor = (noiseFloor * 0.95) + (rms * 0.05);
                        }
                    }
                }
            };

            // Conectando a cadeia de áudio:
            // Source -> HP -> LP -> Gain -> Compressor -> Processor -> Destination
            source.connect(hpFilter);
            hpFilter.connect(lpFilter);
            lpFilter.connect(gainNode);
            gainNode.connect(compressor);
            compressor.connect(processor);
            processor.connect(audioContextRef.current.destination);

            setIsListening(true);
            isListeningRef.current = true;
            callbacksRef.current.onStart?.();

        } catch (err: any) {
            console.error('❌ [Whisper Hook] Erro ao acessar microfone:', err);
            callbacksRef.current.onError?.(err.name === 'NotAllowedError' ? 'not-allowed' : 'mic-error');
        }
    }, [isListening, isProcessing, isLoadingModel, stop]);

    return { isListening, isProcessing, isLoadingModel, start, stop };
};
