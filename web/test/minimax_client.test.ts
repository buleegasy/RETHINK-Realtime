import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniMaxRealtimeClient } from '../src/lib/minimax/client';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 5);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = 'Normal') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

(globalThis as any).WebSocket = MockWebSocket;

describe('MiniMaxRealtimeClient (原生协议客户端验证)', () => {
  it('建立连接时应立即发送 session.update 配置帧，并配置 24kHz 与 asr-01', async () => {
    const onOpen = vi.fn();
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
      callbacks: { onOpen },
    });

    client.connect();

    await new Promise((r) => setTimeout(r, 20));

    expect(onOpen).toHaveBeenCalled();
    expect(client.ready).toBe(true);

    const ws = (client as any).ws as MockWebSocket;
    expect(ws.sentMessages.length).toBeGreaterThan(0);

    const firstMsg = JSON.parse(ws.sentMessages[0]);
    expect(firstMsg.type).toBe('session.update');
    expect(firstMsg.session.input_audio_format).toBe('pcm16');
    expect(firstMsg.session.output_audio_format).toBe('pcm16');
    expect(firstMsg.session.input_audio_transcription.model).toBe('asr-01');

    client.disconnect();
  });

  it('appendAudioChunk 应正确发送 input_audio_buffer.append 帧', async () => {
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    client.sendAudioChunk('AQIDBA==');

    const ws = (client as any).ws as MockWebSocket;
    const lastMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

    expect(lastMsg.type).toBe('input_audio_buffer.append');
    expect(lastMsg.audio).toBe('AQIDBA==');

    client.disconnect();
  });

  it('interrupt 应正确发送 response.cancel 强打断帧', async () => {
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    client.interrupt();

    const ws = (client as any).ws as MockWebSocket;
    const lastMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

    expect(lastMsg.type).toBe('response.cancel');

    client.disconnect();
  });

  it('收到音频增量和文本增量应触发对应回调', async () => {
    const onAudioDelta = vi.fn();
    const onTextDelta = vi.fn();
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
      callbacks: { onAudioDelta, onTextDelta },
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    const ws = (client as any).ws as MockWebSocket;

    ws.onmessage?.({
      data: JSON.stringify({
        type: 'response.output_audio.delta',
        delta: 'AUDIO_CHUNK_TEST',
      }),
    });

    ws.onmessage?.({
      data: JSON.stringify({
        type: 'response.output_text.delta',
        delta: '你好，我是 RETHINK。',
      }),
    });

    expect(onAudioDelta).toHaveBeenCalledWith('AUDIO_CHUNK_TEST');
    expect(onTextDelta).toHaveBeenCalledWith('你好，我是 RETHINK。');

    client.disconnect();
  });

  it('triggerInitialGreeting 应发送带有开场破冰指令的 response.create 帧', async () => {
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    client.triggerInitialGreeting();

    const ws = (client as any).ws as MockWebSocket;
    const lastMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);

    expect(lastMsg.type).toBe('response.create');
    expect(lastMsg.response.modalities).toEqual(['text', 'audio']);
    expect(lastMsg.response.instructions).toContain('欢迎来到 RETHINK');
    expect(lastMsg.response.instructions).toContain('强加密');

    client.disconnect();
  });
});
