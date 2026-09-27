/**
 * Web Audio Worklet 独立音频渲染工作线程定义
 * 用于高精度、低延迟麦克风分块采集与音频流式上行
 */

export const WORKLET_PROCESSOR_NAME = 'microphone-capture-processor';

export const AUDIO_WORKLET_PROCESSOR_CODE = `
class MicrophoneCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage({
          eventType: 'audio_chunk',
          buffer: this.buffer.slice(0),
        });
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor('${WORKLET_PROCESSOR_NAME}', MicrophoneCaptureProcessor);
`;
