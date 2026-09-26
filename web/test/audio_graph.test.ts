import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioGraphService } from '../src/lib/audio/audioGraph';

describe('AudioGraphService 打断音量渐弱与状态管理验证', () => {
  let service: AudioGraphService;

  beforeEach(() => {
    service = new AudioGraphService();
  });

  it('initAudioContext 应成功初始化并直连 destination', async () => {
    const ctx = await service.initAudioContext();
    expect(ctx).toBeDefined();
    expect(ctx.sampleRate).toBe(24000);
  });

  it('stopPlayback 在打断时应执行音量渐弱 (exponentialRampToValueAtTime)', async () => {
    await service.initAudioContext();
    const outputGain = (service as any).outputGainNode;
    expect(outputGain).toBeDefined();

    const rampSpy = vi.spyOn(outputGain.gain, 'exponentialRampToValueAtTime');
    const cancelSpy = vi.spyOn(outputGain.gain, 'cancelScheduledValues');

    service.setAiSpeaking(true);
    expect(service.isPlaybackActive()).toBe(true);

    service.stopPlayback(150);

    expect(cancelSpy).toHaveBeenCalled();
    expect(rampSpy).toHaveBeenCalled();
    expect(service.isPlaybackActive()).toBe(false);
  });

  it('stopPlayback(0) 在销毁时应立即停播而不启动渐弱定时器', async () => {
    await service.initAudioContext();
    const outputGain = (service as any).outputGainNode;

    const rampSpy = vi.spyOn(outputGain.gain, 'exponentialRampToValueAtTime');

    service.setAiSpeaking(true);
    service.stopPlayback(0);

    expect(rampSpy).not.toHaveBeenCalled();
    expect(service.isPlaybackActive()).toBe(false);
  });

  it('setAiSpeaking(false) 与 stopPlayback 应重置 preRollChunks 与连续帧数', async () => {
    await service.initAudioContext();
    (service as any).consecutiveSpeechFrames = 3;
    (service as any).preRollChunks = ['chunk1', 'chunk2'];

    service.setAiSpeaking(false);
    expect((service as any).consecutiveSpeechFrames).toBe(0);
    expect((service as any).preRollChunks).toEqual([]);

    (service as any).consecutiveSpeechFrames = 3;
    (service as any).preRollChunks = ['chunk3'];
    service.stopPlayback(150);
    expect((service as any).consecutiveSpeechFrames).toBe(0);
    expect((service as any).preRollChunks).toEqual([]);
  });

  it('cleanup 应安全释放所有节点与上下文', async () => {
    await service.initAudioContext();
    expect(() => service.cleanup()).not.toThrow();
  });
});
