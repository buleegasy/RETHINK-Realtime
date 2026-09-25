import '@testing-library/jest-dom';

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 24000;
  destination = {};

  createBufferSource() {
    return {
      buffer: null,
      connect: () => {},
      start: () => {},
      stop: () => {},
      disconnect: () => {},
      onended: null,
    };
  }

  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        cancelScheduledValues: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    };
  }

  createOscillator() {
    return {
      type: 'sine',
      frequency: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      start: () => {},
      stop: () => {},
      disconnect: () => {},
    };
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }

  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 128,
      smoothingTimeConstant: 0.5,
      getByteTimeDomainData: (arr: Uint8Array) => arr.fill(128),
      connect: () => {},
      disconnect: () => {},
    };
  }

  createScriptProcessor() {
    return {
      onaudioprocess: null,
      connect: () => {},
      disconnect: () => {},
    };
  }

  createMediaStreamSource() {
    return {
      connect: () => {},
      disconnect: () => {},
    };
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    return Promise.resolve();
  }
}

(globalThis as any).AudioContext = MockAudioContext;
(globalThis as any).webkitAudioContext = MockAudioContext;

if (typeof (globalThis as any).crypto === 'undefined') {
  const nodeCrypto = require('crypto');
  (globalThis as any).crypto = nodeCrypto.webcrypto;
}

const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] || null,
  };
};

const storageMock = createStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: storageMock,
    writable: true,
    configurable: true,
  });
}
