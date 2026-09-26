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
    expect(firstMsg.session.type).toBe('realtime');
    expect(firstMsg.session.audio.input.format.type).toBe('audio/pcm');
    expect(firstMsg.session.audio.input.format.rate).toBe(24000);
    expect(firstMsg.session.audio.output.format.type).toBe('audio/pcm');
    expect(firstMsg.session.audio.output.format.rate).toBe(24000);
    expect(firstMsg.session.audio.input.transcription.model).toBe('whisper-1');

    client.disconnect();
  });

  it('建立连接时应自动发送 response.create 主动播报开场问候语', async () => {
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 20));

    const ws = (client as any).ws as MockWebSocket;
    expect(ws.sentMessages.length).toBeGreaterThanOrEqual(3);

    const itemMsg = JSON.parse(ws.sentMessages[1]);
    expect(itemMsg.type).toBe('conversation.item.create');

    const greetingMsg = JSON.parse(ws.sentMessages[2]);
    expect(greetingMsg.type).toBe('response.create');
    expect(greetingMsg.response.instructions).toContain('你好，欢迎来到Rethink');

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

  it('interrupt 应正确发送 response.cancel 强打断帧并在提供参数时发送 conversation.item.truncate 截断帧', async () => {
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    client.interrupt({ itemId: 'item_asst_123', audioEndMs: 1450 });

    const ws = (client as any).ws as MockWebSocket;
    expect(ws.sentMessages.length).toBeGreaterThanOrEqual(3);

    const cancelMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 2]);
    expect(cancelMsg.type).toBe('response.cancel');

    const truncateMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(truncateMsg.type).toBe('conversation.item.truncate');
    expect(truncateMsg.item_id).toBe('item_asst_123');
    expect(truncateMsg.content_index).toBe(0);
    expect(truncateMsg.audio_end_ms).toBe(1450);

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

  it('sendToolOutput 应正确发送 conversation.item.create 与 response.create 帧', async () => {
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    client.sendToolOutput('call_123', { status: 'ok' });

    const ws = (client as any).ws as MockWebSocket;
    expect(ws.sentMessages.length).toBeGreaterThanOrEqual(3);

    const toolMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 2]);
    expect(toolMsg.type).toBe('conversation.item.create');
    expect(toolMsg.item.type).toBe('function_call_output');
    expect(toolMsg.item.call_id).toBe('call_123');

    const respMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(respMsg.type).toBe('response.create');

    client.disconnect();
  });

  it('打断时若有未完成的工具调用应自动发送 conversation.item.delete 清洗孤儿状态', async () => {
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    const ws = (client as any).ws as MockWebSocket;

    ws.onmessage?.({
      data: JSON.stringify({
        type: 'response.function_call_arguments.delta',
        item_id: 'call_item_test_456',
        delta: '{"location":',
      }),
    });

    client.interrupt({ itemId: 'item_asst_999', audioEndMs: 800 });

    expect(ws.sentMessages.length).toBeGreaterThanOrEqual(4);

    const deleteMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 3]);
    expect(deleteMsg.type).toBe('conversation.item.delete');
    expect(deleteMsg.item_id).toBe('call_item_test_456');

    const cancelMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 2]);
    expect(cancelMsg.type).toBe('response.cancel');

    const truncateMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(truncateMsg.type).toBe('conversation.item.truncate');
    expect(truncateMsg.item_id).toBe('item_asst_999');

    client.disconnect();
  });

  it('收到 conversation.item.truncated 应触发 onItemTruncated 回调', async () => {
    const onItemTruncated = vi.fn();
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
      callbacks: { onItemTruncated },
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    const ws = (client as any).ws as MockWebSocket;

    ws.onmessage?.({
      data: JSON.stringify({
        type: 'conversation.item.truncated',
        item_id: 'item_asst_trunc',
        audio_end_ms: 1200,
      }),
    });

    expect(onItemTruncated).toHaveBeenCalledWith({
      itemId: 'item_asst_trunc',
      audioEndMs: 1200,
    });

    client.disconnect();
  });

  it('updateTurnDetection 应在 speaking 和 listening 状态下分别下发高低阈值', async () => {
    const client = new MiniMaxRealtimeClient({
      relayUrl: 'ws://localhost:8787/api/voice/ws',
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 15));

    client.updateTurnDetection('speaking');

    const ws = (client as any).ws as MockWebSocket;
    const speakingMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(speakingMsg.type).toBe('session.update');
    expect(speakingMsg.session.turn_detection.threshold).toBe(0.85);
    expect(speakingMsg.session.turn_detection.silence_duration_ms).toBe(500);

    client.updateTurnDetection('listening');
    const listeningMsg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]);
    expect(listeningMsg.type).toBe('session.update');
    expect(listeningMsg.session.turn_detection.threshold).toBe(0.5);
    expect(listeningMsg.session.turn_detection.silence_duration_ms).toBe(600);

    client.disconnect();
  });
});
