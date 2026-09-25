import { useEffect, useRef } from 'react';

interface KioskWatchdogOptions {
  enabled: boolean;
  isOffHook: boolean;
  audioLevel: number;
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

  useEffect(() => {
    if (!enabled || !isOffHook) {
      silentSecondsRef.current = 0;
      return;
    }

    const interval = setInterval(() => {

      if (audioLevel < 0.03) {
        silentSecondsRef.current += 1;
        if (silentSecondsRef.current >= silenceTimeoutSeconds) {
          console.warn(`[KioskWatchdog] 持续静默已达 ${silenceTimeoutSeconds}s，触发看门狗自动挂机`);
          clearInterval(interval);
          onSilenceTimeout();
        }
      } else {

        silentSecondsRef.current = 0;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, isOffHook, audioLevel, silenceTimeoutSeconds, onSilenceTimeout]);

  return {
    getSilentSeconds: () => silentSecondsRef.current,
  };
}
