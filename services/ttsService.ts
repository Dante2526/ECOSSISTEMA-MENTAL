import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';
import { isNativePlatform } from './capacitorPlatform';

/**
 * Sintetiza fala em Português do Brasil usando o motor TTS nativo no Android (Capacitor)
 * ou Web Speech API (`window.speechSynthesis`) no navegador/PWA.
 */
export async function speakText(text: string): Promise<void> {
    if (!text || !text.trim()) return;

    if (isNativePlatform()) {
        try {
            await TextToSpeech.stop().catch(() => {});
            await TextToSpeech.speak({
                text,
                lang: 'pt-BR',
                rate: 1.0,
                pitch: 1.0,
                volume: 1.0,
                queueStrategy: QueueStrategy.Flush,
            });
            return;
        } catch (err) {
            console.warn('⚠️ [TTS Nativo] Falha ao falar com idioma pt-BR, tentando padrão do dispositivo:', err);
            try {
                await TextToSpeech.speak({
                    text,
                    rate: 1.0,
                    pitch: 1.0,
                    volume: 1.0,
                    queueStrategy: QueueStrategy.Flush,
                });
                return;
            } catch (fallbackErr) {
                console.warn('⚠️ [TTS Nativo] Indisponível, tentando Web SpeechSynthesis:', fallbackErr);
            }
        }
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Cancela falas anteriores para não encavalar
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Tenta encontrar uma voz masculina natural em pt-BR
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
        (v.name.includes('Google') || v.name.includes('Natural')) &&
        v.lang.includes('pt-BR') &&
        (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('homem') || v.name.includes('Daniel') || v.name.includes('Antonio'))
    ) || voices.find(v => v.lang.includes('pt-BR'));

    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
}

/**
 * Interrompe qualquer síntese de fala em andamento.
 */
export async function stopSpeaking(): Promise<void> {
    if (isNativePlatform()) {
        try {
            await TextToSpeech.stop();
        } catch (_) {}
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
            window.speechSynthesis.cancel();
        } catch (_) {}
    }
}
