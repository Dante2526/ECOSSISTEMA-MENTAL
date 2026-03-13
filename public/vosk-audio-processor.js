class VoskAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = (event) => {
            // Can be used to pass configs if needed
        };
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];
            if (channelData) {
                // Send the raw audio data array back to the main thread where the Vosk model is running
                this.port.postMessage(channelData);
            }
        }
        return true;
    }
}

registerProcessor('vosk-audio-processor', VoskAudioProcessor);
