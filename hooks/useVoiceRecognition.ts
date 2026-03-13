import { useState, useCallback, useRef, useEffect } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { useVoskRecognition } from './useVoskRecognition';

// ... (Web Speech API types e interfaces se mantêm iguais)
interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
}
interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
}
interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: () => void;
    onend: () => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onresult: (event: SpeechRecognitionEvent) => void;
    start(): void;
    stop(): void;
}
declare global {
    interface Window {
        SpeechRecognition: { new(): SpeechRecognition; };
        webkitSpeechRecognition: { new(): SpeechRecognition; };
    }
}

const PERMISSION_STORAGE_KEY = 'voicePermissionGranted';

interface VoiceRecognitionOptions {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
    onResult?: (transcript: string) => void;
}

export const useVoiceRecognition = ({ onStart, onEnd, onError, onResult }: VoiceRecognitionOptions) => {
    const isOnline = useOnlineStatus();

    // --- Estado de Permissão (Comum para ambos) ---
    const [permissionGranted, setPermissionGranted] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(PERMISSION_STORAGE_KEY) === 'true';
        }
        return false;
    });

    const updatePermission = useCallback((granted: boolean) => {
        setPermissionGranted(granted);
        if (granted) {
            localStorage.setItem(PERMISSION_STORAGE_KEY, 'true');
        } else {
            localStorage.removeItem(PERMISSION_STORAGE_KEY);
        }
    }, []);

    // --- Implementação Online (Web Speech API) ---
    const [isListeningOnline, setIsListeningOnline] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const callbacksRef = useRef({ onStart, onEnd, onError, onResult });

    useEffect(() => {
        callbacksRef.current = { onStart, onEnd, onError, onResult };
    }, [onStart, onEnd, onError, onResult]);

    useEffect(() => {
        if (!isOnline) {
            if (isListeningOnline && recognitionRef.current) {
                recognitionRef.current.stop();
            }
            return;
        }

        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            console.warn("Web Speech API não suportada no fallback fallback online.");
            return;
        }

        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        recognition.lang = 'pt-BR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            setIsListeningOnline(true);
            callbacksRef.current.onStart?.();
        };

        recognition.onend = () => {
            setIsListeningOnline(false);
            callbacksRef.current.onEnd?.();
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            setIsListeningOnline(false);
            callbacksRef.current.onError?.(event.error);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            if (event.results && event.results[0] && event.results[0][0]) {
                const transcript = event.results[0][0].transcript;
                callbacksRef.current.onResult?.(transcript);
            }
        };

        return () => {
            if (recognitionRef.current && isListeningOnline) {
                recognitionRef.current.stop();
            }
        };
    }, [isOnline]); // Recria apenas se o status online mudar

    const startOnline = useCallback(() => {
        if (recognitionRef.current && !isListeningOnline) {
            try { recognitionRef.current.start(); } catch (e) { }
        }
    }, [isListeningOnline]);

    const stopOnline = useCallback(() => {
        if (recognitionRef.current && isListeningOnline) {
            recognitionRef.current.stop();
        }
    }, [isListeningOnline]);


    // --- Implementação Offline (Vosk WebAssembly) ---
    const vosk = useVoskRecognition({
        onStart: () => callbacksRef.current.onStart?.(),
        onEnd: () => callbacksRef.current.onEnd?.(),
        onError: (e) => callbacksRef.current.onError?.(e),
        onResult: (t) => callbacksRef.current.onResult?.(t)
    });

    // --- Proxy / Router ---
    const isListening = isOnline ? isListeningOnline : vosk.isListening;

    const start = useCallback(() => {
        if (isOnline) {
            console.log("🎤 Voz: Iniciando modo ONLINE (Web Speech API)");
            startOnline();
        } else {
            console.log("🎤 Voz: Iniciando modo OFFLINE (Vosk WebAssembly)");
            vosk.start();
        }
    }, [isOnline, startOnline, vosk.start]);

    const stop = useCallback(() => {
        if (isOnline) {
            stopOnline();
        } else {
            vosk.stop();
        }
    }, [isOnline, stopOnline, vosk.stop]);

    return { isListening, start, stop, permissionGranted, setPermissionGranted: updatePermission };
};
