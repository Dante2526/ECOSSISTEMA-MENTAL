import { useState, useCallback, useRef, useEffect } from 'react';
import * as vosk from 'vosk-browser';

interface VoskRecognitionOptions {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
    onResult?: (transcript: string) => void;
}

export const useVoskRecognition = ({ onStart, onEnd, onError, onResult }: VoskRecognitionOptions) => {
    const [isListening, setIsListening] = useState(false);
    const recognizerRef = useRef<vosk.KaldiRecognizer | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const modelRef = useRef<vosk.Model | null>(null);
    const isModelLoadingRef = useRef(false);

    const callbacksRef = useRef({ onStart, onEnd, onError, onResult });
    useEffect(() => {
        callbacksRef.current = { onStart, onEnd, onError, onResult };
    }, [onStart, onEnd, onError, onResult]);

    const initModel = useCallback(async () => {
        if (modelRef.current) return true;
        if (isModelLoadingRef.current) return false; // Evitar múltiplos carregamentos simultâneos

        isModelLoadingRef.current = true;
        try {
            const modelUrl = '/models/vosk-model-small-pt-0.3.zip';
            console.log("Iniciando carregamento do modelo Vosk (offline)...");

            const model = await vosk.createModel(modelUrl);
            modelRef.current = model;
            console.log("Modelo Vosk carregado com sucesso!");
            return true;
        } catch (error) {
            console.error('Erro ao carregar modelo Vosk:', error);
            callbacksRef.current.onError?.('vosk-model-error');
            return false;
        } finally {
            isModelLoadingRef.current = false;
        }
    }, []);

    const stop = useCallback(() => {
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
        if (workletNodeRef.current) {
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (recognizerRef.current) {
            recognizerRef.current.free();
            recognizerRef.current = null;
        }
        setIsListening(false);
        callbacksRef.current.onEnd?.();
    }, []);

    const start = useCallback(async () => {
        if (isListening) return;

        try {
            const waitModel = async (): Promise<boolean> => {
                let attempts = 0;
                while (isModelLoadingRef.current && attempts < 20) {
                    await new Promise(r => setTimeout(r, 500));
                    attempts++;
                }
                return !!modelRef.current;
            };

            const hasModel = await initModel();
            const modelReady = hasModel || await waitModel();

            if (!modelReady || !modelRef.current) {
                callbacksRef.current.onError?.('model-not-loaded');
                return;
            }

            if (!audioContextRef.current) {
                audioContextRef.current = new window.AudioContext({ sampleRate: 16000 });
            }
            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    channelCount: 1,
                    sampleRate: 16000
                }
            });

            sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);

            // Fetch the worklet processor module URL relative to root
            try {
                await audioContextRef.current.audioWorklet.addModule('/vosk-audio-processor.js');
            } catch (err) {
                console.error("AudioWorklet initialization failed. Ensure /vosk-audio-processor.js exists locally.", err);
            }

            const recognizer = new modelRef.current.KaldiRecognizer(16000);
            recognizerRef.current = recognizer;

            recognizer.setWords(true);

            recognizer.on("result", (message: any) => {
                // No Vosk-browser, o resultado final vem em message.text
                const transcript = message.text || (message.result && message.result.text);
                
                if (transcript && transcript.trim().length > 0) {
                    console.log("🎤 Vosk Result (Final):", transcript);
                    callbacksRef.current.onResult?.(transcript);
                    stop();
                }
            });

            // Create AudioWorkletNode securely
            const workletNode = new window.AudioWorkletNode(audioContextRef.current, 'vosk-audio-processor');
            workletNodeRef.current = workletNode;

            workletNode.port.onmessage = (event) => {
                if (!recognizerRef.current) return;
                try {
                    const audioData = event.data;
                    recognizerRef.current.acceptWaveform(audioData);
                } catch (err) {
                    console.error("Vosk audio process error", err);
                }
            };

            sourceRef.current.connect(workletNode);
            workletNode.connect(audioContextRef.current.destination);

            setIsListening(true);
            callbacksRef.current.onStart?.();

        } catch (error: any) {
            console.error('Erro ao iniciar Vosk:', error);
            if (error.name === 'NotAllowedError') {
                callbacksRef.current.onError?.('not-allowed');
            } else {
                callbacksRef.current.onError?.(error.message || 'unknown');
            }
        }
    }, [initModel, isListening, stop]);


    useEffect(() => {
        // Inicializa o modelo (ou puxa do cache do Service Worker) imediatamente
        // ao invés de esperar o clique do usuário, garantindo prontidão offline veloz.
        initModel().catch(console.error);

        return () => {
            stop();
            if (modelRef.current) {
                modelRef.current.free();
            }
        };
    }, [stop, initModel]);

    return { isListening, start, stop };
};
