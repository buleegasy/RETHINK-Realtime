export function resampleAndEncodePCM(
  inputBuffer: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = 24000
): string {
  let pcmData: Int16Array;

  if (sourceSampleRate === targetSampleRate) {
    pcmData = floatToInt16(inputBuffer);
  } else {
    const ratio = sourceSampleRate / targetSampleRate;
    const newLength = Math.round(inputBuffer.length / ratio);
    pcmData = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originalPos = i * ratio;
      const index = Math.floor(originalPos);
      const decimal = originalPos - index;

      const val1 = inputBuffer[index] ?? 0;
      const val2 = inputBuffer[index + 1] !== undefined ? inputBuffer[index + 1] : val1;
      const interpolated = val1 + (val2 - val1) * decimal;

      const clamped = Math.max(-1, Math.min(1, interpolated));
      pcmData[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    }
  }

  return int16ToBase64(pcmData);
}

export function floatToInt16(input: Float32Array): Int16Array {
  const result = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    result[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
  }
  return result;
}

export function int16ToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
  let binary = '';
  const chunkSize = 8192;
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function base64PCMToAudioBuffer(
  base64Data: string,
  audioCtx: AudioContext,
  sampleRate: number = 24000
): AudioBuffer {
  if (!base64Data || typeof base64Data !== 'string' || base64Data.trim().length === 0) {
    return audioCtx.createBuffer(1, 1, sampleRate);
  }

  let binaryString: string;
  try {
    binaryString = atob(base64Data);
  } catch {
    return audioCtx.createBuffer(1, 1, sampleRate);
  }

  const evenLen = binaryString.length - (binaryString.length % 2);
  if (evenLen < 2) {
    return audioCtx.createBuffer(1, 1, sampleRate);
  }

  const bytes = new Uint8Array(evenLen);
  for (let i = 0; i < evenLen; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, evenLen / 2);
  if (int16Array.length === 0) {
    return audioCtx.createBuffer(1, 1, sampleRate);
  }

  const audioBuffer = audioCtx.createBuffer(1, int16Array.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < int16Array.length; i++) {
    channelData[i] = int16Array[i] / 32768.0;
  }

  return audioBuffer;
}
