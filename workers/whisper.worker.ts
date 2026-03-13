import { pipeline, env } from '@xenova/transformers';

// Configuração para usar modelos locais se possível ou via CDN do Xenova
env.allowLocalModels = false;
env.useBrowserCache = true;

class WhisperWorker {
    static instance = null;
    classifier = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                progress_callback,
            });
        }
        return this.instance;
    }
}

self.onmessage = async (event) => {
    const { audio, language } = event.data;

    try {
        const transcriber = await WhisperWorker.getInstance((progress) => {
            self.postMessage({ type: 'STATUS', status: 'loading', progress });
        });

        self.postMessage({ type: 'STATUS', status: 'processing' });

        const output = await transcriber(audio, {
            chunk_length_s: 30,
            stride_length_s: 5,
            language: language || 'portuguese',
            task: 'transcribe',
            return_timestamps: false,
        });

        self.postMessage({
            type: 'RESULT',
            text: output.text
        });

    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            error: error.message
        });
    }
};
