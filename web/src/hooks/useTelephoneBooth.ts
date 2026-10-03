import { useEffect, useCallback } from 'react';
import { useBoothStore } from '../store/boothStore';
import { useDtmfTone } from './useDtmfTone';

interface UseTelephoneBoothProps {
  onPickUp: () => void;
  onHangUp: () => void;
  onInterrupt: () => void;
  onToggleMute: () => void;
  enabled?: boolean;
}

export function useTelephoneBooth({
  onPickUp,
  onHangUp,
  onInterrupt,
  onToggleMute,
  enabled = true,
}: UseTelephoneBoothProps) {
  const hookState = useBoothStore((s) => s.hookState);
  const { dialKey, triggerHookSound } = useDtmfTone();

  const handleToggleHook = useCallback(() => {
    if (!enabled) return;
    if (hookState === 'on_hook') {
      triggerHookSound(true);
      onPickUp();
    } else {
      triggerHookSound(false);
      onHangUp();
    }
  }, [enabled, hookState, onPickUp, onHangUp, triggerHookSound]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleToggleHook();
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        onInterrupt();
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        onToggleMute();
        return;
      }

      const key = e.key;
      if (/^[0-9*#]$/.test(key)) {
        dialKey(key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleToggleHook, onInterrupt, onToggleMute, dialKey]);

  return {
    handleToggleHook,
    dialKey,
  };
}
