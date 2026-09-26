import { describe, it, expect } from 'vitest';
import { createWavHeader, generateMiniMaxChatReply, synthesizeRealtimeAudio } from '../src/lib/minimax-voice-relay';

describe('MiniMax Voice Relay 模块单元测试', () => {
  it('createWavHeader 应生成标准的 44 字节 WAV 头', () => {
    const header = createWavHeader(48000, 24000, 1, 16);
    expect(header.length).toBe(44);

    const magicRiff = String.fromCharCode(...header.slice(0, 4));
    expect(magicRiff).toBe('RIFF');

    const magicWave = String.fromCharCode(...header.slice(8, 12));
    expect(magicWave).toBe('WAVE');

    const view = new DataView(header.buffer);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it('generateMiniMaxChatReply 在未提供 apiKey 时优雅返回空字符串', async () => {
    const reply = await generateMiniMaxChatReply({
      messages: [{ role: 'user', content: '你好' }],
      apiKey: '',
    });
    expect(reply).toBe('');
  });

  it('synthesizeRealtimeAudio 在空文本或缺少 apiKey 时安全返回空字符串', async () => {
    const audio = await synthesizeRealtimeAudio({
      text: '',
      apiKey: '',
    });
    expect(audio).toBe('');
  });
});
