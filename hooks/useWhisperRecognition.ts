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
            
            // 1. Filtro Passa-Alta mais agressivo (350Hz) para cortar vento de ventilador próximo
            const hpFilter = audioContextRef.current.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = 350;
            hpFilter.Q.value = 1.0; // Pico leve para clareza da voz
            
            // 2. Ganho Aprimorado
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = 4.5; 
            
            const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);

            audioChunksRef.current = [];
            let silenceStartTime = 0;
            let hasSpeechStarted = false;
            let smoothedRms = 0;
            let noiseFloor = 0.01;
            let framesAnalyzed = 0;
            let energyVariance = 0;
            
            const SILENCE_THRESHOLD_STRICT = 0.045; 
            const AUTO_STOP_MS = 1500;
            const MAX_RECORDING_MS = 10000;
            const CALIBRATION_FRAMES = 4;
            const startTime = Date.now();

            processor.onaudioprocess = (e) => {
                if (isStoppingRef.current) return;
                
                if (Date.now() - startTime > MAX_RECORDING_MS) {
                    console.log("⚡ [Whisper Hook] Timeout máximo.");
                    stop();
                    return;
                }

                const inputData = e.inputBuffer.getChannelData(0);
                
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                
                smoothedRms = (smoothedRms * 0.75) + (rms * 0.25);
                framesAnalyzed++;

                if (framesAnalyzed < CALIBRATION_FRAMES) {
                    noiseFloor = Math.max(noiseFloor, smoothedRms);
                    return;
                }

                energyVariance = Math.abs(rms - smoothedRms);
                const dynamicThreshold = Math.max(SILENCE_THRESHOLD_STRICT, noiseFloor * 1.8);

                if (!hasSpeechStarted) {
                    // Exigência maior de variação para ignorar ventilador constante
                    if (smoothedRms > dynamicThreshold && energyVariance > (dynamicThreshold * 0.35)) {
                        hasSpeechStarted = true;
                        console.log(`🎤 [Whisper Hook] Voz detectada! RMS: ${smoothedRms.toFixed(4)} | Variância: ${energyVariance.toFixed(4)}`);
                    } else if (smoothedRms > dynamicThreshold) {
                        if (framesAnalyzed % 30 === 0) console.log("💨 [Whisper Hook] Ruído constante detectado (Ignorando ventilador...)");
                    }
                }

                if (hasSpeechStarted) {
                    const cleanedData = new Float32Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        cleanedData[i] = Math.abs(inputData[i]) < (dynamicThreshold * 0.5) ? 0 : inputData[i];
                    }
                    
                    audioChunksRef.current.push(cleanedData);
                    
                    const isSilent = smoothedRms < dynamicThreshold || energyVariance < (dynamicThreshold * 0.15);
                    
                    if (isSilent) {
                        if (silenceStartTime === 0) silenceStartTime = Date.now();
                        const silenceDuration = Date.now() - silenceStartTime;
                        if (silenceDuration > AUTO_STOP_MS) {
                            console.log(`⚡ [Whisper Hook] Parando por silêncio/ruído constante.`);
                            stop();
                        }
                    } else {
                        silenceStartTime = 0;
                    }
                }
                
                if (framesAnalyzed % 40 === 0 && hasSpeechStarted) {
                    console.log(`🎤 [Whisper Hook] Gravando... RMS: ${smoothedRms.toFixed(4)} | Gate: ${(dynamicThreshold * 0.6).toFixed(4)}`);
                }
            };

            source.connect(hpFilter);
            hpFilter.connect(gainNode);
            gainNode.connect(processor);
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
