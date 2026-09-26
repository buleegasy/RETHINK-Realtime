import { resampleAndEncodePCM, base64PCMToAudioBuffer } from './audioResampler';
import { AUDIO_CONSTRAINTS } from '../minimax/constants';

export class AudioGraphService {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private speakerAnalyserNode: AnalyserNode | null = null;
  private outputGainNode: GainNode | null = null;
  private inputGainNode: GainNode | null = null;
  private highpassFilterNode: BiquadFilterNode | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private audioElement: HTMLAudioElement | null = null;

  private nextPlayTime: number = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];
  private playbackStartCtxTime: number | null = null;
  private isMuted: boolean = false;
  private isAiSpeaking: boolean = false;
  private consecutiveSpeechFrames: number = 0;
  private preRollChunks: string[] = [];
  private onLocalInterruptCallback: ((playedMs: number) => void) | null = null;
  private onPlaybackStateChange: ((isPlaying: boolean) => void) | null = null;
  private boundDeviceChangeListener: (() => void) | null = null;

  private jitterBuffer: AudioBuffer[] = [];
  private jitterBufferedSec: number = 0;
  private isJitterBuffering: boolean = true;
  private readonly JITTER_TARGET_SEC: number = 0.12;
  private readonly JITTER_REBUFFER_SEC: number = 0.05;

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

      this.speakerAnalyserNode = this.audioCtx.createAnalyser();
      this.speakerAnalyserNode.fftSize = 256;
      this.speakerAnalyserNode.smoothingTimeConstant = 0.3;

      this.outputGainNode.connect(this.speakerAnalyserNode);
      this.speakerAnalyserNode.connect(this.audioCtx.destination);
      if (this.streamDestination) {
        try {
          this.speakerAnalyserNode.connect(this.streamDestination);
        } catch {}
      }
    }
    return this.audioCtx;
  }

  public setOnLocalInterrupt(callback: (playedMs: number) => void): void {
    this.onLocalInterruptCallback = callback;
  }

  public setOnPlaybackStateChange(callback: (isPlaying: boolean) => void): void {
    this.onPlaybackStateChange = callback;
  }

  public isPlaybackActive(): boolean {
    return this.isAiSpeaking || this.scheduledSources.length > 0 || this.jitterBuffer.length > 0;
  }

  public setAiSpeaking(speaking: boolean): void {
    if (this.isAiSpeaking === speaking) {
      if (!speaking) {
        this.consecutiveSpeechFrames = 0;
        this.preRollChunks = [];
      }
      return;
    }
    this.isAiSpeaking = speaking;
    if (!speaking) {
      this.consecutiveSpeechFrames = 0;
      this.preRollChunks = [];
    }
    this.onPlaybackStateChange?.(speaking);
  }

  private getSpeakerRms(): number {
    if (!this.speakerAnalyserNode || !this.isAiSpeaking) return 0;
    const data = new Uint8Array(this.speakerAnalyserNode.frequencyBinCount);
    this.speakerAnalyserNode.getByteTimeDomainData(data);
    let sum = 0;
    for (const byte of data) {
      const v = (byte - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
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
      if (this.highpassFilterNode) {
        this.sourceNode.connect(this.highpassFilterNode);
      } else if (this.inputGainNode) {
        this.sourceNode.connect(this.inputGainNode);
      } else if (this.analyserNode) {
        this.sourceNode.connect(this.analyserNode);
      }
    } catch {}
  }

  public async startRecording(onAudioChunk: (pcm16Base64: string) => void): Promise<void> {
    const ctx = await this.initAudioContext();

    this.mediaStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
    this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);

    this.highpassFilterNode = ctx.createBiquadFilter();
    this.highpassFilterNode.type = 'highpass';
    this.highpassFilterNode.frequency.setValueAtTime(100, ctx.currentTime);
    this.highpassFilterNode.Q.setValueAtTime(0.7, ctx.currentTime);

    this.inputGainNode = ctx.createGain();
    this.inputGainNode.gain.setValueAtTime(1.0, ctx.currentTime);

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.5;

    let warmUpFrames = 4;
    this.processorNode = ctx.createScriptProcessor(2048, 1, 1);
    this.processorNode.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      out.fill(0);
      if (this.isMuted) return;

      if (warmUpFrames > 0) {
        warmUpFrames--;
        return;
      }

      const inputBuffer = e.inputBuffer.getChannelData(0);

      let sum = 0;
      for (const v of inputBuffer) {
        sum += v * v;
      }
      const micRms = Math.sqrt(sum / inputBuffer.length);
      const speakerRms = this.getSpeakerRms();
      const playedMs = this.getPlaybackDurationMs();

      let shouldStreamChunk = true;

      if (this.isAiSpeaking || this.isPlaybackActive()) {
        // AI 刚开始播报的 250ms 内为扬声器初始瞬态抑制窗（对齐官方 App 瞬态保护）
        if (playedMs < 250) {
          this.consecutiveSpeechFrames = 0;
          this.preRollChunks = [];
          return;
        }

        const dynamicThreshold = Math.max(0.18, speakerRms * 0.85 + 0.1);
        if (micRms > dynamicThreshold) {
          this.consecutiveSpeechFrames++;
          const base64 = resampleAndEncodePCM(inputBuffer, ctx.sampleRate, 24000);
          if (base64) {
            this.preRollChunks.push(base64);
            if (this.preRollChunks.length > 6) {
              this.preRollChunks.shift();
            }
          }

          if (this.consecutiveSpeechFrames >= 4) {
            // 打断判定达标（连续 4 帧约 170ms）：执行平滑渐弱与前置缓冲回溯补发
            const bufferedChunks = [...this.preRollChunks];
            this.stopPlayback(150);
            this.consecutiveSpeechFrames = 0;
            this.preRollChunks = [];

            // 零字头丢失补偿：将插话判定期间暂存的前置音频块完整补发给服务端
            for (const chunk of bufferedChunks) {
              onAudioChunk(chunk);
            }
            this.onLocalInterruptCallback?.(playedMs);
          }
        } else {
          this.consecutiveSpeechFrames = 0;
          this.preRollChunks = [];
        }
      } else {
        this.consecutiveSpeechFrames = 0;
        this.preRollChunks = [];
        const base64 = resampleAndEncodePCM(inputBuffer, ctx.sampleRate, 24000);
        if (base64) {
          onAudioChunk(base64);
        }
      }
    };

    this.sourceNode.connect(this.highpassFilterNode);
    this.highpassFilterNode.connect(this.inputGainNode);
    this.inputGainNode.connect(this.analyserNode);
    this.inputGainNode.connect(this.processorNode);
    this.processorNode.connect(ctx.destination);

    this.ensureOutputGraph(ctx);

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

  private ensureOutputGraph(ctx: AudioContext): GainNode {
    if (!this.outputGainNode) {
      this.outputGainNode = ctx.createGain();
      this.outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);

      this.speakerAnalyserNode = ctx.createAnalyser();
      this.speakerAnalyserNode.fftSize = 256;
      this.speakerAnalyserNode.smoothingTimeConstant = 0.3;

      this.outputGainNode.connect(this.speakerAnalyserNode);
      this.speakerAnalyserNode.connect(ctx.destination);

      if (this.streamDestination) {
        try {
          this.speakerAnalyserNode.connect(this.streamDestination);
        } catch {}
      }
    }
    return this.outputGainNode;
  }

  private playDecodedAudioBuffer(ctx: AudioContext, audioBuffer: AudioBuffer, onEnded?: () => void): void {
    const outputGain = this.ensureOutputGraph(ctx);
    outputGain.gain.cancelScheduledValues(ctx.currentTime);
    outputGain.gain.setValueAtTime(0.85, ctx.currentTime);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputGain);
    if (this.analyserNode) {
      source.connect(this.analyserNode);
    }

    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx !== -1) {
        this.scheduledSources.splice(idx, 1);
      }
      if (this.scheduledSources.length === 0 && this.jitterBuffer.length === 0) {
        this.playbackStartCtxTime = null;
        this.setAiSpeaking(false);
        this.isJitterBuffering = true;
        this.consecutiveSpeechFrames = 0;
      }
      onEnded?.();
    };

    this.setAiSpeaking(true);
    source.start(ctx.currentTime);
    this.scheduledSources.push(source);
  }

  public async playAudioUrl(url: string, onEnded?: () => void): Promise<void> {
    const ctx = await this.initAudioContext();
    try {
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.playDecodedAudioBuffer(ctx, audioBuffer, onEnded);
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
      this.playDecodedAudioBuffer(ctx, audioBuffer, onEnded);
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

  private flushJitterBuffer(): void {
    if (!this.audioCtx || !this.outputGainNode) return;
    const ctx = this.audioCtx;

    if (this.outputGainNode) {
      this.outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
      this.outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
    }

    while (this.jitterBuffer.length > 0) {
      const buffer = this.jitterBuffer.shift();
      if (!buffer) continue;
      this.jitterBufferedSec = Math.max(0, this.jitterBufferedSec - buffer.duration);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outputGainNode);
      if (this.analyserNode) {
        source.connect(this.analyserNode);
      }

      const now = ctx.currentTime;
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now + 0.025;
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
        if (this.scheduledSources.length === 0 && this.jitterBuffer.length === 0) {
          this.playbackStartCtxTime = null;
          this.setAiSpeaking(false);
          this.isJitterBuffering = true;
          this.consecutiveSpeechFrames = 0;
        }
      };
    }
  }

  public enqueueAudioChunk(base64Chunk: string): void {
    if (!this.audioCtx || !this.outputGainNode) return;
    const ctx = this.audioCtx;

    const buffer = base64PCMToAudioBuffer(base64Chunk, ctx, 24000);
    if (buffer.length <= 1) return;

    this.setAiSpeaking(true);
    this.jitterBuffer.push(buffer);
    this.jitterBufferedSec += buffer.duration;

    let threshold = 0;
    if (this.scheduledSources.length === 0) {
      threshold = this.isJitterBuffering ? this.JITTER_TARGET_SEC : this.JITTER_REBUFFER_SEC;
    }

    if (this.jitterBufferedSec >= threshold) {
      this.isJitterBuffering = false;
      this.flushJitterBuffer();
    }
  }

  public stopPlayback(fadeDurationMs: number = 150): void {
    if (!this.audioCtx || !this.outputGainNode) return;
    const ctx = this.audioCtx;
    const wasSpeaking = this.isAiSpeaking;
    this.playbackStartCtxTime = null;
    this.setAiSpeaking(false);
    this.isJitterBuffering = true;
    this.consecutiveSpeechFrames = 0;
    this.preRollChunks = [];
    this.jitterBuffer = [];
    this.jitterBufferedSec = 0;

    const sourcesToStop = [...this.scheduledSources];
    this.scheduledSources = [];

    if ((sourcesToStop.length === 0 && !wasSpeaking) || fadeDurationMs <= 0) {
      try {
        this.outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
        this.outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
      } catch {}
      for (const s of sourcesToStop) {
        try {
          s.stop();
          s.disconnect();
        } catch {}
      }
      this.nextPlayTime = ctx.currentTime;
      return;
    }

    const fadeDurationSec = fadeDurationMs / 1000;
    const fadeEndTime = ctx.currentTime + fadeDurationSec;

    try {
      this.outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
      const currentGain = Math.max(0.001, this.outputGainNode.gain.value);
      this.outputGainNode.gain.setValueAtTime(currentGain, ctx.currentTime);
      this.outputGainNode.gain.exponentialRampToValueAtTime(0.0001, fadeEndTime);
    } catch {}

    for (const s of sourcesToStop) {
      try {
        s.stop(fadeEndTime);
      } catch {
        try {
          s.stop();
        } catch {}
      }
    }

    setTimeout(() => {
      for (const s of sourcesToStop) {
        try {
          s.disconnect();
        } catch {}
      }
      if (this.outputGainNode && this.audioCtx) {
        this.outputGainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.outputGainNode.gain.setValueAtTime(0.85, this.audioCtx.currentTime);
      }
      this.nextPlayTime = this.audioCtx ? this.audioCtx.currentTime : 0;
    }, fadeDurationMs + 20);
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
    this.stopPlayback(0);
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
    if (this.inputGainNode) {
      try {
        this.inputGainNode.disconnect();
      } catch {}
      this.inputGainNode = null;
    }
    if (this.highpassFilterNode) {
      try {
        this.highpassFilterNode.disconnect();
      } catch {}
      this.highpassFilterNode = null;
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
    if (this.speakerAnalyserNode) {
      try {
        this.speakerAnalyserNode.disconnect();
      } catch {}
      this.speakerAnalyserNode = null;
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
