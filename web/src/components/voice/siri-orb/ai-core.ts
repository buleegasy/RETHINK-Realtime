import {
  type MotionValue,
  useAnimationFrame,
  useMotionValue,
} from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

export type AIState =
  | "idle"
  | "listening"
  | "thinking"
  | "streaming"
  | "done"
  | "error";

export type AIStateMotif =
  | "breathe"
  | "receive"
  | "scan"
  | "pulse"
  | "ping"
  | "fault";

export type AIStateAccent = "success" | "danger" | null;

export type AIStateMotion = {
  accent: AIStateAccent;
  glow: number;
  hueRotate: number;
  intensity: number;
  motif: AIStateMotif;
  pulseSeconds: number;
  turbulence: number;
  tumble: number;
  reactivity: number;
  saturation: number;
  scale: number;
  speed: number;
};

export const AI_STATE_MOTION: Record<AIState, AIStateMotion> = {
  done: {
    accent: "success",
    glow: 0.7,
    hueRotate: 0,
    intensity: 0.4,
    motif: "ping",
    pulseSeconds: 0.65,
    reactivity: 0,
    saturation: 1,
    scale: 1.1,
    speed: 0.8,
    tumble: 0.02,
    turbulence: 0.08,
  },
  error: {
    accent: "danger",
    glow: 0.25,
    hueRotate: 0,
    intensity: 0.5,
    motif: "fault",
    pulseSeconds: 0.9,
    reactivity: 0,
    saturation: 0.3,
    scale: 0.96,
    speed: 1,
    tumble: 0,
    turbulence: 0.55,
  },
  idle: {
    accent: null,
    glow: 0.15,
    hueRotate: 0,
    intensity: 0.3,
    motif: "breathe",
    pulseSeconds: 4.5,
    reactivity: 0,
    saturation: 0.75,
    scale: 0.94,
    speed: 0.6,
    tumble: 0.012,
    turbulence: 0.14,
  },
  listening: {
    accent: null,
    glow: 0.6,
    hueRotate: 0,
    intensity: 0.75,
    motif: "receive",
    pulseSeconds: 1.6,
    reactivity: 1,
    saturation: 1.05,
    scale: 1.06,
    speed: 1,
    tumble: 0.03,
    turbulence: 0.42,
  },
  streaming: {
    accent: null,
    glow: 0.45,
    hueRotate: -10,
    intensity: 0.6,
    motif: "pulse",
    pulseSeconds: 1.25,
    reactivity: 0.6,
    saturation: 1,
    scale: 1.02,
    speed: 1.4,
    tumble: 0.06,
    turbulence: 0.5,
  },
  thinking: {
    accent: null,
    glow: 0.35,
    hueRotate: 18,
    intensity: 1,
    motif: "scan",
    pulseSeconds: 1.1,
    reactivity: 0.15,
    saturation: 1,
    scale: 1,
    speed: 2.4,
    tumble: 0.14,
    turbulence: 0.95,
  },
};

export const AI_ACCENT_COLORS: Record<"success" | "danger", string> = {
  danger: "oklch(63% 0.21 25)",
  success: "oklch(72% 0.17 150)",
};

export const getAIStateAccentColor = (
  state: AIState | undefined,
  fallback: string
): string => {
  const accent = AI_STATE_MOTION[state ?? "idle"]?.accent;
  return accent ? AI_ACCENT_COLORS[accent] : fallback;
};

export const getAIStateMotion = (state: AIState | undefined): AIStateMotion =>
  AI_STATE_MOTION[state ?? "idle"] ?? AI_STATE_MOTION.idle;

export type AIAmplitude = number | MotionValue<number> | undefined;

const isMotionValue = (value: AIAmplitude): value is MotionValue<number> =>
  typeof value === "object" && value !== null && "get" in value;

export const useAmplitudeValue = (
  amplitude: AIAmplitude
): MotionValue<number> => {
  const fallback = useMotionValue(0);
  const numeric = typeof amplitude === "number" ? amplitude : null;

  useEffect(() => {
    if (numeric !== null) {
      fallback.set(numeric);
    }
  }, [numeric, fallback]);

  return isMotionValue(amplitude) ? amplitude : fallback;
};

export type AudioAmplitudeStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unsupported";

export type UseAudioAmplitudeOptions = {
  autoStart?: boolean;
  smoothing?: number;
  fftSize?: number;
};

export type UseAudioAmplitudeResult = {
  amplitude: MotionValue<number>;
  status: AudioAmplitudeStatus;
  start: () => Promise<void>;
  stop: () => void;
};

const DEFAULT_SMOOTHING = 0.55;
const DEFAULT_FFT_SIZE = 512;
const RMS_TO_UNIT = 3.2;
const ATTACK_FACTOR = 0.35;

export const useAudioAmplitude = (
  options: UseAudioAmplitudeOptions = {}
): UseAudioAmplitudeResult => {
  const {
    autoStart = false,
    smoothing = DEFAULT_SMOOTHING,
    fftSize = DEFAULT_FFT_SIZE,
  } = options;

  const amplitude = useMotionValue(0);
  const [status, setStatus] = useState<AudioAmplitudeStatus>("idle");

  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const stop = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    analyserRef.current = null;
    bufferRef.current = null;
    contextRef.current?.close();
    contextRef.current = null;
    amplitude.set(0);
    setStatus("idle");
  }, [amplitude]);

  const start = useCallback(async () => {
    if (analyserRef.current) {
      return;
    }

    const AudioContextCtor =
      typeof window === "undefined"
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext);

    if (!(AudioContextCtor && navigator.mediaDevices?.getUserMedia)) {
      setStatus("unsupported");
      return;
    }

    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = fftSize;
      context.createMediaStreamSource(stream).connect(analyser);

      streamRef.current = stream;
      contextRef.current = context;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);
      setStatus("active");
    } catch {
      setStatus("denied");
    }
  }, [fftSize]);

  useEffect(() => {
    if (autoStart) {
      start();
    }
    return stop;
  }, [autoStart, start, stop]);

  useAnimationFrame(() => {
    const analyser = analyserRef.current;
    const buffer = bufferRef.current;
    if (!(analyser && buffer)) {
      return;
    }

    analyser.getFloatTimeDomainData(buffer);

    let sumOfSquares = 0;
    for (const sample of buffer) {
      sumOfSquares += sample * sample;
    }
    const rms = Math.sqrt(sumOfSquares / buffer.length);
    const target = Math.min(1, rms * RMS_TO_UNIT);

    const previous = amplitude.get();
    const factor = target > previous ? smoothing * ATTACK_FACTOR : smoothing;
    amplitude.set(previous + (target - previous) * (1 - factor));
  });

  return { amplitude, start, status, stop };
};

export const useSimulatedAmplitude = (
  state: AIState = "idle"
): MotionValue<number> => {
  const amplitude = useMotionValue(0);
  const motion = getAIStateMotion(state);

  useAnimationFrame((time) => {
    const t = time / 1000;
    const envelope =
      0.5 +
      0.3 * Math.sin(t * 2.1 * motion.speed) +
      0.14 * Math.sin(t * 5.3 * motion.speed + 1.7) +
      0.06 * Math.sin(t * 11.7 * motion.speed + 0.4);

    amplitude.set(Math.min(1, Math.max(0, envelope * motion.intensity)));
  });

  return amplitude;
};
