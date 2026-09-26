import { resampleAndEncodePCM, base64PCMToAudioBuffer } from './audioResampler';
import { AUDIO_CONSTRAINTS } from '../minimax/constants';

export class AudioGraphService {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private outputGainNode: GainNode | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private audioElement: HTMLAudioElement | null = null;

  private nextPlayTime: number = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];
  private playbackStartCtxTime: number | null = null;
  private isMuted: boolean = false;
  private isAiSpeaking: boolean = false;
  private consecutiveSpeechFrames: number = 0;
  private onLocalInterruptCallback: ((playedMs: number) => void) | null = null;
  private boundDeviceChangeListener: (() => void) | null = null;

  public async initAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      try {
        this.audioCtx = new AudioCtxClass({ sampleRate: 24000, latencyHint: 'interactive' });
      } catch {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (!this.streamDestination && this.audioCtx && typeof this.audioCtx.createMediaStreamDestination === 'function') {
      this.streamDestination = this.audioCtx.createMediaStreamDestination();
      if (typeof document !== 'undefined') {
        this.audioElement = document.createElement('audio');
        this.audioElement.autoplay = true;
        try {
          this.audioElement.srcObject = this.streamDestination.stream;
        } catch {}
        this.audioElement.volume = 1.0;
      }
    }
    if (!this.outputGainNode && this.audioCtx) {
      this.outputGainNode = this.audioCtx.createGain();
      this.outputGainNode.gain.setValueAtTime(0.85, this.audioCtx.currentTime);
      if (this.streamDestination) {
        this.outputGainNode.connect(this.streamDestination);
      } else {
        this.outputGainNode.connect(this.audioCtx.destination);
      }
    }
    return this.audioCtx;
  }

  public setOnLocalInterrupt(callback: (playedMs: number) => void): void {
    this.onLocalInterruptCallback = callback;
  }

  public setAiSpeaking(speaking: boolean): void {
    this.isAiSpeaking = speaking;
    if (!speaking) {
      this.consecutiveSpeechFrames = 0;
    }
  }

  public async reinitInputStream(): Promise<void> {
    if (!this.audioCtx) return;
    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((t) => t.stop());
        this.mediaStream = null;
      }
      if (this.sourceNode) {
        try {
          this.sourceNode.disconnect();
        } catch {}
        this.sourceNode = null;
      }
      this.mediaStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
      if (this.analyserNode) {
        this.sourceNode.connect(this.analyserNode);
      }
      if (this.processorNode && this.analyserNode) {
        this.analyserNode.connect(this.processorNode);
      }
    } catch {}
  }

  public async startRecording(onAudioChunk: (pcm16Base64: string) => void): Promise<void> {
    const ctx = await this.initAudioContext();

    this.mediaStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
    this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.5;

    this.processorNode = ctx.createScriptProcessor(2048, 1, 1);
    this.processorNode.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      out.fill(0);
      if (this.isMuted) return;

      const inputBuffer = e.inputBuffer.getChannelData(0);

      let sum = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        const v = inputBuffer[i];
        sum += v * v;
      }
      const micRms = Math.sqrt(sum / inputBuffer.length);

      if (this.isAiSpeaking) {
        if (micRms > 0.08) {
          this.consecutiveSpeechFrames++;
          if (this.consecutiveSpeechFrames >= 2) {
            const playedMs = this.getPlaybackDurationMs();
            this.stopPlayback();
            this.consecutiveSpeechFrames = 0;
            this.onLocalInterruptCallback?.(playedMs);
          }
        } else {
          this.consecutiveSpeechFrames = 0;
        }
      } else {
        this.consecutiveSpeechFrames = 0;
      }

      const base64 = resampleAndEncodePCM(inputBuffer, ctx.sampleRate, 24000);
      if (base64) {
        onAudioChunk(base64);
      }
    };

    this.sourceNode.connect(this.analyserNode);
    this.analyserNode.connect(this.processorNode);
    this.processorNode.connect(ctx.destination);

    if (!this.outputGainNode) {
      this.outputGainNode = ctx.createGain();
      this.outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
      if (this.streamDestination) {
        this.outputGainNode.connect(this.streamDestination);
      } else {
        this.outputGainNode.connect(ctx.destination);
      }
    }

    if (!this.boundDeviceChangeListener && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      this.boundDeviceChangeListener = () => {
        this.reinitInputStream().catch(() => {});
      };
      try {
        navigator.mediaDevices.addEventListener('devicechange', this.boundDeviceChangeListener);
      } catch {}
    }

    this.nextPlayTime = ctx.currentTime;
  }

  public async playAudioUrl(url: string, onEnded?: () => void): Promise<void> {
    const ctx = await this.initAudioContext();
    try {
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      if (!this.outputGainNode) {
        this.outputGainNode = ctx.createGain();
        this.outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
        if (this.streamDestination) {
          this.outputGainNode.connect(this.streamDestination);
        } else {
          this.outputGainNode.connect(ctx.destination);
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputGainNode);
      if (this.analyserNode) {
        source.connect(this.analyserNode);
      }

      source.onended = () => {
        const idx = this.scheduledSources.indexOf(source);
        if (idx !== -1) {
          this.scheduledSources.splice(idx, 1);
        }
        if (this.scheduledSources.length === 0) {
          this.playbackStartCtxTime = null;
          this.isAiSpeaking = false;
          this.consecutiveSpeechFrames = 0;
        }
        onEnded?.();
      };

      this.isAiSpeaking = true;
      source.start(ctx.currentTime);
      this.scheduledSources.push(source);
    } catch {
      onEnded?.();
    }
  }

  public async playBase64Audio(base64Data: string, onEnded?: () => void): Promise<void> {
    if (!base64Data) {
      onEnded?.();
      return;
    }
    const ctx = await this.initAudioContext();
    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

      if (!this.outputGainNode) {
        this.outputGainNode = ctx.createGain();
        this.outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
        if (this.streamDestination) {
          this.outputGainNode.connect(this.streamDestination);
        } else {
          this.outputGainNode.connect(ctx.destination);
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputGainNode);
      if (this.analyserNode) {
        source.connect(this.analyserNode);
      }

      source.onended = () => {
        const idx = this.scheduledSources.indexOf(source);
        if (idx !== -1) {
          this.scheduledSources.splice(idx, 1);
        }
        if (this.scheduledSources.length === 0) {
          this.playbackStartCtxTime = null;
          this.isAiSpeaking = false;
          this.consecutiveSpeechFrames = 0;
        }
        onEnded?.();
      };

      this.isAiSpeaking = true;
      source.start(ctx.currentTime);
      this.scheduledSources.push(source);
    } catch {
      onEnded?.();
    }
  }

  public getPlaybackDurationMs(): number {
    if (!this.audioCtx || this.playbackStartCtxTime === null) return 0;
    const now = this.audioCtx.currentTime;
    if (now < this.playbackStartCtxTime) return 0;
    const elapsedSec = now - this.playbackStartCtxTime;
    return Math.max(0, Math.round(elapsedSec * 1000));
  }

  public enqueueAudioChunk(base64Chunk: string): void {
    if (!this.audioCtx || !this.outputGainNode) return;
    const ctx = this.audioCtx;

    const buffer = base64PCMToAudioBuffer(base64Chunk, ctx, 24000);
    if (buffer.length <= 1) return;

    this.isAiSpeaking = true;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputGainNode);
    if (this.analyserNode) {
      source.connect(this.analyserNode);
    }

    const now = ctx.currentTime;
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now + 0.005;
    }

    if (this.playbackStartCtxTime === null || this.scheduledSources.length === 0) {
      this.playbackStartCtxTime = this.nextPlayTime;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;

    this.scheduledSources.push(source);
    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx !== -1) {
        this.scheduledSources.splice(idx, 1);
      }
      if (this.scheduledSources.length === 0) {
        this.playbackStartCtxTime = null;
        this.isAiSpeaking = false;
        this.consecutiveSpeechFrames = 0;
      }
    };
  }

  public stopPlayback(): void {
    if (!this.audioCtx || !this.outputGainNode) return;
    const ctx = this.audioCtx;
    this.nextPlayTime = ctx.currentTime;
    this.playbackStartCtxTime = null;
    this.isAiSpeaking = false;
    this.consecutiveSpeechFrames = 0;

    try {
      this.outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
      this.outputGainNode.gain.setValueAtTime(this.outputGainNode.gain.value, ctx.currentTime);
      this.outputGainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.015);
    } catch {}

    for (const s of this.scheduledSources) {
      try {
        s.stop();
        s.disconnect();
      } catch {}
    }
    this.scheduledSources = [];

    setTimeout(() => {
      if (this.outputGainNode && this.audioCtx) {
        this.outputGainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.outputGainNode.gain.setValueAtTime(0.85, this.audioCtx.currentTime);
      }
      this.nextPlayTime = this.audioCtx ? this.audioCtx.currentTime : 0;
    }, 20);
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  public getAudioLevel(): number {
    if (!this.analyserNode || this.isMuted) return 0;
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(1, rms * 4);
  }

  public cleanup(): void {
    this.stopPlayback();
    if (this.boundDeviceChangeListener && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      try {
        navigator.mediaDevices.removeEventListener('devicechange', this.boundDeviceChangeListener);
      } catch {}
      this.boundDeviceChangeListener = null;
    }
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {}
      this.analyserNode = null;
    }
    if (this.outputGainNode) {
      try {
        this.outputGainNode.disconnect();
      } catch {}
      this.outputGainNode = null;
    }
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.srcObject = null;
      } catch {}
      this.audioElement = null;
    }
    if (this.streamDestination) {
      try {
        this.streamDestination.disconnect();
      } catch {}
      this.streamDestination = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
