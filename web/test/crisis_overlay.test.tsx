import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrisisOverlay } from '../src/components/common/CrisisOverlay';
import { useBoothStore } from '../src/store/boothStore';

describe('CrisisOverlay 危机浮层挂机联动测试', () => {
  beforeEach(() => {
    useBoothStore.getState().setCrisisOverlayOpen(true);
  });

  it('关闭浮层时应调用 onEndCall 与 onClose 回调', () => {
    const endCallSpy = vi.fn();
    const closeSpy = vi.fn();

    render(<CrisisOverlay onEndCall={endCallSpy} onClose={closeSpy} />);

    const closeBtn = screen.getByLabelText('关闭生命支持提示');
    fireEvent.click(closeBtn);

    expect(endCallSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(useBoothStore.getState().isCrisisOverlayOpen).toBe(false);
  });

  it('点击"我已知晓，返回待机界面"时应分发 rethink:crisis:end_call 事件', () => {
    const eventSpy = vi.fn();
    window.addEventListener('rethink:crisis:end_call', eventSpy);

    render(<CrisisOverlay />);

    const ackBtn = screen.getByText('我已知晓，返回待机界面');
    fireEvent.click(ackBtn);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(useBoothStore.getState().isCrisisOverlayOpen).toBe(false);
    window.removeEventListener('rethink:crisis:end_call', eventSpy);
  });
});
