import { useState, useCallback, useRef, useEffect } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition as NativeSpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { useOnlineStatus } from './useOnlineStatus';
import { useWhisperRecognition } from './useWhisperRecognition';
import { isNativePlatform } from '../services/capacitorPlatform';

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
interface WebSpeechRecognition extends EventTarget {
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
        SpeechRecognition: { new(): WebSpeechRecognition; };
        webkitSpeechRecognition: { new(): WebSpeechRecognition; };
    }
}

const PERMISSION_STORAGE_KEY = 'voicePermissionGranted';
const IS_MOBILE = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const ONLINE_TIMEOUT_MS = IS_MOBILE ? 8000 : 10000;

interface VoiceRecognitionOptions {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
    onResult?: (transcript: string) => void;
}

export const useVoiceRecognition = ({ onStart, onEnd, onError, onResult }: VoiceRecognitionOptions) => {
    const isOnline = useOnlineStatus();
    const isNative = isNativePlatform();

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

    // Sincronizar permissão nativa ao iniciar no Capacitor
    useEffect(() => {
        if (!isNative) return;
        NativeSpeechRecognition.checkPermissions()
            .then((status) => {
                if (status.speechRecognition === 'granted') {
                    updatePermission(true);
                }
            })
            .catch(() => {});
    }, [isNative, updatePermission]);

    // --- Implementação Offline (Whisper AI) ---
    // Pré-carrega automaticamente apenas quando offline para economizar RAM durante uso 3D
    const whisper = useWhisperRecognition({
        onStart: () => callbacksRef.current.onStart?.(),
        onEnd: () => callbacksRef.current.onEnd?.(),
        onError: (e) => callbacksRef.current.onError?.(e),
        onResult: (t) => callbacksRef.current.onResult?.(t),
        shouldPreload: !isOnline
    });

    // Refs para funções de start/stop do Whisper (disponíveis em todo o hook)
    const whisperStartRef = useRef(whisper.start);
    const whisperStopRef = useRef(whisper.stop);
    useEffect(() => {
        whisperStartRef.current = whisper.start;
        whisperStopRef.current = whisper.stop;
    }, [whisper.start, whisper.stop]);

    // --- Estado e Refs de Reconhecimento Online (Web Speech API ou Nativo Android) ---
    const [isListeningOnline, setIsListeningOnline] = useState(false);
    const recognitionRef = useRef<WebSpeechRecognition | null>(null);
    const callbacksRef = useRef({ onStart, onEnd, onError, onResult });
    const gotResultRef = useRef(false);
    const onlineTimeoutRef = useRef<number | null>(null);
    const networkRetryPendingRef = useRef(false);
    const isStartingOrActiveRef = useRef(false);
    const stoppedByUserRef = useRef(false);
    const lastNativeErrorCodeRef = useRef<string | null>(null);

    useEffect(() => {
        callbacksRef.current = { onStart, onEnd, onError, onResult };
    }, [onStart, onEnd, onError, onResult]);

    // --- Setup de Eventos Nativos (@capgo/capacitor-speech-recognition) ---
    useEffect(() => {
        if (!isNative) return;

        let disposed = false;
        let errorListener: PluginListenerHandle | null = null;

        NativeSpeechRecognition.addListener('error', (event) => {
            lastNativeErrorCodeRef.current = event.code;
        }).then((handle) => {
            if (disposed) {
                handle.remove().catch(() => {});
            } else {
                errorListener = handle;
            }
        }).catch(() => {});

        return () => {
            disposed = true;
            if (onlineTimeoutRef.current) {
                clearTimeout(onlineTimeoutRef.current);
                onlineTimeoutRef.current = null;
            }
            errorListener?.remove().catch(() => {});
            NativeSpeechRecognition.stop().catch(() => {});
        };
    }, [isNative]);

    // --- Setup Web Speech API (somente navegador Web/PWA) ---
    useEffect(() => {
        if (isNative) return;

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
            isStartingOrActiveRef.current = true;
            gotResultRef.current = false;
            networkRetryPendingRef.current = false;
            setIsListeningOnline(true);
            callbacksRef.current.onStart?.();
            console.log("🎤 [Voz Online] Escutando...");

            if (onlineTimeoutRef.current) clearTimeout(onlineTimeoutRef.current);
            onlineTimeoutRef.current = window.setTimeout(() => {
                console.warn(`⚠️ [Voz Online] Timeout de ${ONLINE_TIMEOUT_MS / 1000}s atingido, parando...`);
                try { recognition.stop(); } catch (_) {}
            }, ONLINE_TIMEOUT_MS);
        };

        recognition.onend = () => {
            isStartingOrActiveRef.current = false;
            if (onlineTimeoutRef.current) {
                clearTimeout(onlineTimeoutRef.current);
                onlineTimeoutRef.current = null;
            }
            setIsListeningOnline(false);

            if (!gotResultRef.current && !networkRetryPendingRef.current) {
                console.warn("⚠️ [Voz Online] Encerrado sem resultado (no-speech).");
                callbacksRef.current.onError?.('no-speech');
            }
            callbacksRef.current.onEnd?.();
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            isStartingOrActiveRef.current = false;
            if (onlineTimeoutRef.current) {
                clearTimeout(onlineTimeoutRef.current);
                onlineTimeoutRef.current = null;
            }
            setIsListeningOnline(false);

            if (event.error === 'no-speech' || event.error === 'aborted') {
                callbacksRef.current.onError?.('no-speech');
            } else if (event.error === 'not-allowed') {
                console.warn("⚠️ [Voz Online] Web Speech API retornou 'not-allowed' — acionando fallback local com Whisper...");
                networkRetryPendingRef.current = true;
                whisperStartRef.current();
            } else if (event.error === 'network') {
                console.warn("⚠️ [Voz Online] Erro de rede — tentando fallback para Whisper...");
                networkRetryPendingRef.current = true;
                callbacksRef.current.onError?.('network-fallback');
            } else {
                console.warn("⚠️ [Voz Online] Aviso:", event.error);
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
    }, [isNative]);

    // Se ficar offline enquanto está escutando online, parar
    useEffect(() => {
        if (!isOnline && isListeningOnline) {
            console.log("⚡ [Voz Online] Ficou offline, parando reconhecimento...");
            isStartingOrActiveRef.current = false;
            setIsListeningOnline(false);
            if (onlineTimeoutRef.current) {
                clearTimeout(onlineTimeoutRef.current);
                onlineTimeoutRef.current = null;
            }
            if (isNative) {
                stoppedByUserRef.current = true;
                NativeSpeechRecognition.stop().catch(() => {});
            } else if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (_) {}
            }
        }
    }, [isOnline, isListeningOnline, isNative]);

    const startNativeSpeech = useCallback(async () => {
        if (isStartingOrActiveRef.current) {
            console.log("ℹ️ [Voz Nativa] Reconhecimento já ativo ou iniciando.");
            return;
        }

        isStartingOrActiveRef.current = true;
        gotResultRef.current = false;
        networkRetryPendingRef.current = false;
        stoppedByUserRef.current = false;
        lastNativeErrorCodeRef.current = null;

        try {
            const { available } = await NativeSpeechRecognition.available();
            if (stoppedByUserRef.current) {
                isStartingOrActiveRef.current = false;
                return;
            }
            if (!available) {
                console.warn("⚠️ [Voz Nativa] Serviço de fala do Android indisponível — usando Whisper local...");
                isStartingOrActiveRef.current = false;
                whisperStartRef.current();
                return;
            }

            let perm = await NativeSpeechRecognition.checkPermissions();
            if (perm.speechRecognition !== 'granted') {
                perm = await NativeSpeechRecognition.requestPermissions();
            }
            if (stoppedByUserRef.current) {
                isStartingOrActiveRef.current = false;
                return;
            }
            if (perm.speechRecognition !== 'granted') {
                isStartingOrActiveRef.current = false;
                updatePermission(false);
                callbacksRef.current.onError?.('not-allowed');
                return;
            }
            updatePermission(true);

            setIsListeningOnline(true);
            callbacksRef.current.onStart?.();
            console.log("🎤 [Voz Nativa] Escutando...");

            if (onlineTimeoutRef.current) clearTimeout(onlineTimeoutRef.current);
            onlineTimeoutRef.current = window.setTimeout(() => {
                console.warn(`⚠️ [Voz Nativa] Timeout de ${ONLINE_TIMEOUT_MS / 1000}s atingido, parando...`);
                NativeSpeechRecognition.forceStop().catch(() => NativeSpeechRecognition.stop().catch(() => {}));
            }, ONLINE_TIMEOUT_MS);

            const result = await NativeSpeechRecognition.start({
                language: 'pt-BR',
                maxResults: 1,
                partialResults: false,
                popup: false,
            });

            if (onlineTimeoutRef.current) {
                clearTimeout(onlineTimeoutRef.current);
                onlineTimeoutRef.current = null;
            }
            isStartingOrActiveRef.current = false;
            setIsListeningOnline(false);

            const transcript = result?.matches?.[0]?.trim();
            if (transcript) {
                gotResultRef.current = true;
                console.log(`✅ [Voz Nativa] Resultado: "${transcript}"`);
                callbacksRef.current.onResult?.(transcript);
            } else if (!stoppedByUserRef.current) {
                callbacksRef.current.onError?.('no-speech');
            }
            callbacksRef.current.onEnd?.();
        } catch (err: any) {
            if (onlineTimeoutRef.current) {
                clearTimeout(onlineTimeoutRef.current);
                onlineTimeoutRef.current = null;
            }
            isStartingOrActiveRef.current = false;
            setIsListeningOnline(false);

            const nativeCode = lastNativeErrorCodeRef.current;
            const errMsg = String(err?.message || err || '').toLowerCase();

            if (stoppedByUserRef.current) {
                callbacksRef.current.onEnd?.();
                return;
            }

            if (nativeCode === 'INSUFFICIENT_PERMISSIONS' || errMsg.includes('permission')) {
                updatePermission(false);
                callbacksRef.current.onError?.('not-allowed');
            } else if (
                nativeCode === 'NETWORK' ||
                nativeCode === 'NETWORK_TIMEOUT' ||
                nativeCode === 'SERVER' ||
                nativeCode === 'SERVER_DISCONNECTED' ||
                errMsg.includes('network')
            ) {
                console.warn("⚠️ [Voz Nativa] Erro de rede — fallback para Whisper...");
                networkRetryPendingRef.current = true;
                callbacksRef.current.onError?.('network-fallback');
            } else if (nativeCode === 'NO_MATCH' || nativeCode === 'SPEECH_TIMEOUT') {
                callbacksRef.current.onError?.('no-speech');
            } else if (nativeCode === 'RECOGNIZER_BUSY' || errMsg.includes('already running')) {
                NativeSpeechRecognition.forceStop().catch(() => {});
                callbacksRef.current.onError?.('no-speech');
            } else if (errMsg.includes('not available') || nativeCode === 'START_FAILED') {
                console.warn("⚠️ [Voz Nativa] Falha ao iniciar reconhecimento nativo, acionando Whisper:", errMsg);
                whisperStartRef.current();
            } else {
                console.warn("⚠️ [Voz Nativa] Aviso:", nativeCode || errMsg);
                callbacksRef.current.onError?.('no-speech');
            }
            callbacksRef.current.onEnd?.();
        }
    }, [updatePermission]);

    const startOnline = useCallback(() => {
        if (isNative) {
            startNativeSpeech();
            return;
        }

        if (!recognitionRef.current) return;

        // Se já está ativo ou iniciando, previne chamadas duplicadas (elimina 'already started')
        if (isStartingOrActiveRef.current) {
            console.log("ℹ️ [Voz Online] Reconhecimento já ativo ou iniciando.");
            return;
        }

        isStartingOrActiveRef.current = true;
        try {
            recognitionRef.current.start();
        } catch (e: any) {
            if (e.name === 'InvalidStateError' || e.message?.includes('already started')) {
                console.warn("⚠️ [Voz Online] Reconhecimento já em andamento.");
                return;
            }
            console.warn("⚠️ [Voz Online] Falha ao iniciar Web Speech API, acionando Whisper:", e.message || e);
            isStartingOrActiveRef.current = false;
            setIsListeningOnline(false);
            whisperStartRef.current();
        }
    }, [isNative, startNativeSpeech]);

    const stopOnline = useCallback(() => {
        stoppedByUserRef.current = true;
        isStartingOrActiveRef.current = false;
        setIsListeningOnline(false);
        if (onlineTimeoutRef.current) {
            clearTimeout(onlineTimeoutRef.current);
            onlineTimeoutRef.current = null;
        }
        if (isNative) {
            NativeSpeechRecognition.stop().catch(() => NativeSpeechRecognition.forceStop().catch(() => {}));
        } else if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
        }
    }, [isNative]);

    // Verificar se reconhecimento online (nativo Android ou Web Speech API) está disponível
    const hasWebSpeechAPI = typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    // --- Proxy / Router ---
    const useOnlineMode = isOnline && (isNative || hasWebSpeechAPI);
    const isListening = isListeningOnline || whisper.isListening;
    const isProcessing = whisper.isProcessing;
    const isLoadingModel = whisper.isLoadingModel;
    const modelLoadProgress = whisper.modelLoadProgress;

    const start = useCallback(() => {
        if (useOnlineMode) {
            console.log(isNative ? "🎤 Voz: Modo NATIVO Android (com fallback Whisper)" : "🎤 Voz: Modo ONLINE (Web Speech com fallback Whisper)");
            startOnline();
        } else {
            console.log("🎤 Voz: Modo OFFLINE (Whisper AI)");
            whisperStartRef.current();
        }
    }, [useOnlineMode, isNative, startOnline]);

    const stop = useCallback(() => {
        if (isStartingOrActiveRef.current || isListeningOnline) {
            stopOnline();
        }
        if (whisper.isListening) {
            whisperStopRef.current();
        }
    }, [isListeningOnline, stopOnline, whisper.isListening]);

    // --- Fallback automático: online → offline em erro de rede ---
    const handleNetworkFallback = useCallback(() => {
        console.log("🔄 [Voz] Fallback automático: tentando Whisper após falha de rede...");
        setTimeout(() => {
            whisperStartRef.current();
        }, 200);
    }, []);

    return {
        isListening,
        isProcessing,
        isLoadingModel,
        modelLoadProgress,
        start,
        stop,
        permissionGranted,
        setPermissionGranted: updatePermission,
        handleNetworkFallback
    };
};

