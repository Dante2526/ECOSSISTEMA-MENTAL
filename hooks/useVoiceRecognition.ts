import { useState, useCallback, useRef, useEffect } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { useWhisperRecognition } from './useWhisperRecognition';

// --- Interfaces de Tipagem (Web Speech API) ---
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

    // --- Estado de Permissão ---
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
    const gotResultRef = useRef(false); // Rastreio se recebemos resultado antes do onend
    const onlineTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        callbacksRef.current = { onStart, onEnd, onError, onResult };
    }, [onStart, onEnd, onError, onResult]);

    // Criar instância de SpeechRecognition (uma única vez, reutilizável)
    useEffect(() => {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            console.warn("⚠️ [Voz Online] Web Speech API não suportada neste navegador.");
            return;
        }

        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        recognition.lang = 'pt-BR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            gotResultRef.current = false;
            setIsListeningOnline(true);
            callbacksRef.current.onStart?.();
            console.log("🎤 [Voz Online] Escutando...");

            // Timeout de segurança: se a API travar, cancelar após 10s
            if (onlineTimeoutRef.current) clearTimeout(onlineTimeoutRef.current);
            onlineTimeoutRef.current = window.setTimeout(() => {
                console.warn("⚠️ [Voz Online] Timeout de 10s atingido, parando...");
                try { recognition.stop(); } catch (_) {}
            }, 10000);
        };

        recognition.onend = () => {
            if (onlineTimeoutRef.current) {
                clearTimeout(onlineTimeoutRef.current);
                onlineTimeoutRef.current = null;
            }
            setIsListeningOnline(false);

            // Se não recebemos resultado antes do onend, pode ser um encerramento inesperado
            if (!gotResultRef.current) {
                console.warn("⚠️ [Voz Online] Encerrado sem resultado (no-speech ou rede caiu).");
                callbacksRef.current.onError?.('no-speech');
            }
            callbacksRef.current.onEnd?.();
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (onlineTimeoutRef.current) {
                clearTimeout(onlineTimeoutRef.current);
                onlineTimeoutRef.current = null;
            }
            setIsListeningOnline(false);
            console.error("❌ [Voz Online] Erro:", event.error);

            // 'no-speech' e 'aborted' são erros "normais", não precisam de alarme
            if (event.error === 'no-speech' || event.error === 'aborted') {
                callbacksRef.current.onError?.('no-speech');
            } else if (event.error === 'not-allowed') {
                callbacksRef.current.onError?.('not-allowed');
            } else if (event.error === 'network') {
                console.warn("⚠️ [Voz Online] Erro de rede — a conexão pode ter caído.");
                callbacksRef.current.onError?.('network');
            } else {
                callbacksRef.current.onError?.(event.error);
            }
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            gotResultRef.current = true;
            if (event.results && event.results[0] && event.results[0][0]) {
                const transcript = event.results[0][0].transcript;
                const confidence = event.results[0][0].confidence;
                console.log(`✅ [Voz Online] Resultado: "${transcript}" (confiança: ${(confidence * 100).toFixed(0)}%)`);
                callbacksRef.current.onResult?.(transcript);
            }
        };

        return () => {
            if (onlineTimeoutRef.current) {
                clearTimeout(onlineTimeoutRef.current);
            }
            try { recognition.stop(); } catch (_) {}
            recognitionRef.current = null;
        };
    }, []); // Criar uma única vez, não recriar ao mudar online/offline

    // Se ficar offline enquanto está escutando, parar
    useEffect(() => {
        if (!isOnline && isListeningOnline && recognitionRef.current) {
            console.log("⚡ [Voz Online] Ficou offline, parando reconhecimento...");
            try { recognitionRef.current.stop(); } catch (_) {}
        }
    }, [isOnline, isListeningOnline]);

    const startOnline = useCallback(() => {
        if (recognitionRef.current && !isListeningOnline) {
            try { 
                recognitionRef.current.start(); 
            } catch (e: any) {
                console.error("❌ [Voz Online] Erro ao iniciar:", e.message);
                // Se der erro ao iniciar, pode ser que já está rodando
                // Tentar parar e reiniciar
                try {
                    recognitionRef.current.stop();
                    setTimeout(() => {
                        try { recognitionRef.current?.start(); } catch (_) {}
                    }, 200);
                } catch (_) {}
            }
        }
    }, [isListeningOnline]);

    const stopOnline = useCallback(() => {
        if (recognitionRef.current && isListeningOnline) {
            try { recognitionRef.current.stop(); } catch (_) {}
        }
    }, [isListeningOnline]);

    // --- Implementação Offline (Whisper AI) ---
    const whisper = useWhisperRecognition({
        onStart: () => callbacksRef.current.onStart?.(),
        onEnd: () => callbacksRef.current.onEnd?.(),
        onError: (e) => callbacksRef.current.onError?.(e),
        onResult: (t) => callbacksRef.current.onResult?.(t)
    });

    // Refs para funções de start/stop do Whisper (evita recriar callbacks)
    const whisperStartRef = useRef(whisper.start);
    const whisperStopRef = useRef(whisper.stop);
    useEffect(() => {
        whisperStartRef.current = whisper.start;
        whisperStopRef.current = whisper.stop;
    }, [whisper.start, whisper.stop]);

    // Verificar se Web Speech API está disponível
    const hasWebSpeechAPI = typeof window !== 'undefined' && 
        !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    // --- Proxy / Router ---
    // Se online E tem Web Speech API: usar Google, senão: usar Whisper
    const useOnlineMode = isOnline && hasWebSpeechAPI;
    const isListening = useOnlineMode ? isListeningOnline : whisper.isListening;
    const isProcessing = !useOnlineMode && whisper.isProcessing;
    const isLoadingModel = !useOnlineMode && whisper.isLoadingModel;
    const modelLoadProgress = whisper.modelLoadProgress;

    const start = useCallback(() => {
        if (useOnlineMode) {
            console.log("🎤 Voz: Modo ONLINE (Web Speech)");
            startOnline();
        } else {
            console.log("🎤 Voz: Modo OFFLINE (Whisper AI)");
            whisperStartRef.current();
        }
    }, [useOnlineMode, startOnline]);

    const stop = useCallback(() => {
        if (useOnlineMode) {
            stopOnline();
        } else {
            whisperStopRef.current();
        }
    }, [useOnlineMode, stopOnline]);

    return { 
        isListening, 
        isProcessing,
        isLoadingModel,
        modelLoadProgress,
        start, 
        stop, 
        permissionGranted, 
        setPermissionGranted: updatePermission 
    };
};
