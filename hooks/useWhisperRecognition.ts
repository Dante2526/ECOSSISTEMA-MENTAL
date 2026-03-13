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
                console.log("⚡ [Whisper Hook] Resultado recebido do worker:", text);
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

    const stop = useCallback(async () => {
        if (!isListening) return;

        console.log("⚡ [Whisper Hook] Parando gravação e enviando para processamento...");
        setIsListening(false);
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (audioContextRef.current) {
            if (audioContextRef.current.state !== 'closed') {
               await audioContextRef.current.close();
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
    }, [isListening]);

    const start = useCallback(async () => {
        if (isListening || isProcessing || isLoadingModel) return;

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
            
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = 1.8; 
            
            const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

            audioChunksRef.current = [];
            let silenceStartTime = 0;
            let hasSpeechStarted = false;
            const SILENCE_THRESHOLD = 0.015; // Ajustável conforme o ruído ambiente
            const AUTO_STOP_MS = 1500; // 1.5 segundos de silêncio para parar

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Cálculo de Energia (RMS) para detecção de silêncio
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);

                // Detecção de início de fala (evita processar ruído puro)
                if (!hasSpeechStarted && rms > SILENCE_THRESHOLD) {
                    hasSpeechStarted = true;
                    console.log("🎤 [Whisper Hook] Fala detectada!");
                }

                if (hasSpeechStarted) {
                    audioChunksRef.current.push(Float32Array.from(inputData));
                    
                    // Lógica de Auto-Stop
                    if (rms < SILENCE_THRESHOLD) {
                        if (silenceStartTime === 0) silenceStartTime = Date.now();
                        
                        const silenceDuration = Date.now() - silenceStartTime;
                        if (silenceDuration > AUTO_STOP_MS) {
                            console.log("⚡ [Whisper Hook] Silêncio detectado por 1.5s. Parando automaticamente...");
                            stop();
                        }
                    } else {
                        silenceStartTime = 0; // Reset se ouvir algo
                    }
                }
                
                if (audioChunksRef.current.length % 50 === 0 && audioChunksRef.current.length > 0) {
                    console.log(`🎤 [Whisper Hook] Gravando... (${audioChunksRef.current.length} blocos)`);
                }
            };

            source.connect(gainNode);
            gainNode.connect(processor);
            processor.connect(audioContextRef.current.destination);

            setIsListening(true);
            callbacksRef.current.onStart?.();

        } catch (err: any) {
            console.error('❌ [Whisper Hook] Erro ao acessar microfone:', err);
            callbacksRef.current.onError?.(err.name === 'NotAllowedError' ? 'not-allowed' : 'mic-error');
        }
    }, [isListening, isProcessing, isLoadingModel]);

    return { isListening, isProcessing, isLoadingModel, start, stop };
};
