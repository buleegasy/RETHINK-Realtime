import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKioskWatchdog } from '../src/hooks/useKioskWatchdog';

describe('树莓派终端无人值守看门狗测试 (Kiosk Watchdog)', () => {
  it('当摘机且音量持续低于静默阈值超时时，应触发自动挂机回调', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();

    renderHook(
      (props) =>
        useKioskWatchdog({
          enabled: props.enabled,
          isOffHook: props.isOffHook,
          audioLevel: props.audioLevel,
          silenceTimeoutSeconds: 5,
          onSilenceTimeout: onTimeout,
        }),
      {
        initialProps: {
          enabled: true,
          isOffHook: true,
          audioLevel: 0.01,
        },
      },
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('当检测到声音时应重置静音计时', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();

    const { rerender } = renderHook(
      (props) =>
        useKioskWatchdog({
          enabled: true,
          isOffHook: true,
          audioLevel: props.audioLevel,
          silenceTimeoutSeconds: 5,
          onSilenceTimeout: onTimeout,
        }),
      {
        initialProps: { audioLevel: 0.01 },
      },
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    rerender({ audioLevel: 0.25 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    rerender({ audioLevel: 0.01 });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onTimeout).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
