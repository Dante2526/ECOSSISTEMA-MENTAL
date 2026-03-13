class VoskAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = (event) => {};
        this.port.postMessage({ type: 'PROCESSOR_READY' });
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];
            if (channelData && channelData.length > 0) {
                this.port.postMessage(channelData);
            }
        }
        return true;
    }
}

registerProcessor('vosk-audio-processor', VoskAudioProcessor);
