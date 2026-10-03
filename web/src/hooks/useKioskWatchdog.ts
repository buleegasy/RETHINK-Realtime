import { useEffect, useRef } from 'react';
import { useBoothStore } from '../store/boothStore';

interface KioskWatchdogOptions {
  enabled: boolean;
  isOffHook: boolean;
  audioLevel?: number;
  silenceTimeoutSeconds?: number;
  onSilenceTimeout: () => void;
}

export function useKioskWatchdog({
  enabled,
  isOffHook,
  audioLevel,
  silenceTimeoutSeconds = 120,
  onSilenceTimeout,
}: KioskWatchdogOptions) {
  const silentSecondsRef = useRef(0);
  const audioLevelRef = useRef(audioLevel ?? 0);
  const onTimeoutRef = useRef(onSilenceTimeout);
  onTimeoutRef.current = onSilenceTimeout;

  if (audioLevel !== undefined) {
    audioLevelRef.current = audioLevel;
  }

  useEffect(() => {
    if (audioLevel !== undefined) return;
    const unsub = useBoothStore.subscribe((state) => {
      audioLevelRef.current = state.audioLevel;
    });
    return unsub;
  }, [audioLevel]);

  useEffect(() => {
    if (!enabled || !isOffHook) {
      silentSecondsRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      if (audioLevelRef.current < 0.03) {
        silentSecondsRef.current += 1;
        if (silentSecondsRef.current >= silenceTimeoutSeconds) {
          console.warn(
            `[KioskWatchdog] 持续静默已达 ${silenceTimeoutSeconds}s，触发看门狗自动挂机`,
          );
          clearInterval(interval);
          onTimeoutRef.current?.();
        }
      } else {
        silentSecondsRef.current = 0;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, isOffHook, silenceTimeoutSeconds]);

  return {
    getSilentSeconds: () => silentSecondsRef.current,
  };
}
