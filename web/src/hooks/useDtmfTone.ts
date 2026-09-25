import { useCallback } from 'react';
import { playDtmfTone, playHookSwitchSound } from '../lib/audio/dtmf';
import { useBoothStore } from '../store/boothStore';

export function useDtmfTone() {
  const appendDialDigit = useBoothStore((s) => s.appendDialDigit);

  const dialKey = useCallback(
    (key: string) => {
      playDtmfTone(key);
      appendDialDigit(key);
    },
    [appendDialDigit]
  );

  const triggerHookSound = useCallback((isOffHook: boolean) => {
    playHookSwitchSound(isOffHook);
  }, []);

  return {
    dialKey,
    triggerHookSound,
  };
}
