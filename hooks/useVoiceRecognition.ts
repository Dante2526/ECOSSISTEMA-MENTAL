import { useState, useEffect, useRef, useCallback } from 'react';

// FIX: Add type definitions for the Web Speech API which are not included in standard TypeScript DOM typings.
// This resolves errors related to SpeechRecognition and its associated event types.
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
        SpeechRecognition: { new (): SpeechRecognition; };
        webkitSpeechRecognition: { new (): SpeechRecognition; };
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
    const [isListening, setIsListening] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(PERMISSION_STORAGE_KEY) === 'true';
        }
        return false;
    });
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    // Use a ref to hold the latest callbacks, preventing the main effect from re-running
    const callbacksRef = useRef({ onStart, onEnd, onError, onResult });
    callbacksRef.current = { onStart, onEnd, onError, onResult };

    useEffect(() => {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            callbacksRef.current.onError?.('not-supported');
            return;
        }

        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        recognition.lang = 'pt-BR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            setIsListening(true);
            callbacksRef.current.onStart?.();
        };

        recognition.onend = () => {
            setIsListening(false);
            callbacksRef.current.onEnd?.();
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            setIsListening(false);
            callbacksRef.current.onError?.(event.error);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
             if (event.results && event.results[0] && event.results[0][0]) {
                const transcript = event.results[0][0].transcript;
                callbacksRef.current.onResult?.(transcript);
            }
        };

        // Cleanup on unmount
        return () => {
            if (recognition) {
                recognition.stop();
            }
        };
    }, []); // Empty dependency array ensures this runs only ONCE.

    const start = useCallback(() => {
        if (recognitionRef.current && !isListening) {
             try {
                recognitionRef.current.start();
             } catch(e) {
                // May throw if already started, ignore.
             }
        }
    }, [isListening]);

    const stop = useCallback(() => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
        }
    }, [isListening]);
    
    const updatePermission = useCallback((granted: boolean) => {
        setPermissionGranted(granted);
        if (granted) {
            localStorage.setItem(PERMISSION_STORAGE_KEY, 'true');
        } else {
            localStorage.removeItem(PERMISSION_STORAGE_KEY);
        }
    }, []);

    return { isListening, start, stop, permissionGranted, setPermissionGranted: updatePermission };
};
