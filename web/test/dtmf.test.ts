import { describe, it, expect } from 'vitest';
import { DTMF_FREQUENCIES, playDtmfTone, playHookSwitchSound } from '../src/lib/audio/dtmf';

describe('DTMF 双音多频与电话亭音效验证 (DTMF Synthesizer)', () => {
  it('所有 12 个电话按键必须具备符合 ITU-T Q.23 的行频与列频定义', () => {
    const keys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'];
    for (const k of keys) {
      expect(DTMF_FREQUENCIES[k]).toBeDefined();
      const [low, high] = DTMF_FREQUENCIES[k];
      expect(low).toBeGreaterThan(600);
      expect(low).toBeLessThan(1000);
      expect(high).toBeGreaterThan(1200);
      expect(high).toBeLessThan(1500);
    }

    expect(DTMF_FREQUENCIES['1']).toEqual([697, 1209]);
    expect(DTMF_FREQUENCIES['5']).toEqual([770, 1336]);
    expect(DTMF_FREQUENCIES['9']).toEqual([852, 1477]);
    expect(DTMF_FREQUENCIES['*']).toEqual([941, 1209]);
    expect(DTMF_FREQUENCIES['#']).toEqual([941, 1477]);
  });

  it('playDtmfTone 与 playHookSwitchSound 调用不抛出异常', () => {
    expect(() => playDtmfTone('1')).not.toThrow();
    expect(() => playHookSwitchSound(true)).not.toThrow();
    expect(() => playHookSwitchSound(false)).not.toThrow();
  });
});
