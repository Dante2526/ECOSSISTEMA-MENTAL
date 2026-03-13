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
    const processorRef = useRef<ScriptProcessorNode | null>(null);
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
            // @ts-ignore
            vosk.setLogLevel(-1); // Ocultar logs excessivos do C++
            const modelUrl = 'https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip';
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
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
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
            const hasModel = await initModel();
            if (!hasModel || !modelRef.current) {
                if (!isModelLoadingRef.current) callbacksRef.current.onError?.('model-not-loaded');
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    channelCount: 1,
                    sampleRate: 16000
                }
            });

            audioContextRef.current = new AudioContext({ sampleRate: 16000 });
            sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);

            // ScriptProcessorNode is deprecated mas funciona universalmente. 
            // AudioWorklet é melhor para produção futura.
            processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

            const recognizer = new modelRef.current.KaldiRecognizer(16000);
            recognizerRef.current = recognizer;

            recognizer.setWords(true);

            recognizer.on("result", (message: any) => {
                const result = message.result;
                if (result && result.text && result.text.length > 0) {
                    console.log("Vosk Result:", result.text);
                    callbacksRef.current.onResult?.(result.text);
                    // Como o app usa o microfone como "push to talk/listen", paramos após o primeiro resultado útil longo
                    stop();
                }
            });

            processorRef.current.onaudioprocess = (event) => {
                if (!recognizerRef.current) return;
                try {
                    const audioData = event.inputBuffer.getChannelData(0);
                    recognizerRef.current.acceptWaveform(audioData);
                } catch (err) {
                    console.error("Vosk audio process error", err);
                }
            };

            sourceRef.current.connect(processorRef.current);
            processorRef.current.connect(audioContextRef.current.destination);

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
        return () => {
            stop();
            if (modelRef.current) {
                modelRef.current.free();
            }
        };
    }, [stop]);

    return { isListening, start, stop };
};
