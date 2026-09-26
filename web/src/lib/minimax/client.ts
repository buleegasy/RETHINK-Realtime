import {
  MINIMAX_MODEL,
  AUDIO_SAMPLE_RATE,
  DEFAULT_VOICE,
  CBT_VOICE_TOOLS,
  DEFAULT_VOICE_INSTRUCTIONS,
} from './constants';
import type { MiniMaxClientCallbacks, MiniMaxSessionConfig, MiniMaxServerEvent } from './types';
import { getWsUrl } from '../api';

export interface MiniMaxClientOptions {
  relayUrl?: string;
  sessionConfig?: MiniMaxSessionConfig;
  callbacks?: MiniMaxClientCallbacks;
  maxReconnectAttempts?: number;
}

export class MiniMaxRealtimeClient {
  private ws: WebSocket | null = null;
  private readonly options: MiniMaxClientOptions;
  private readonly callbacks: MiniMaxClientCallbacks;
  private isConnected: boolean = false;
  private isExplicitlyClosed: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private messageQueue: Record<string, unknown>[] = [];
  private currentResponseItemId: string | null = null;
  private currentToolCallItemId: string | null = null;

  constructor(options?: MiniMaxClientOptions) {
    this.options = options || {};
    this.callbacks = options?.callbacks || {};
  }

  public get ready(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  public getCurrentResponseItemId(): string | null {
    return this.currentResponseItemId;
  }

  public connect(): void {
    this.isExplicitlyClosed = false;
    this.cleanupSocket();

    const wsUrl = this.options.relayUrl || getWsUrl();

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        console.log('[MiniMaxClient] 实时语音链路已建立');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startKeepalive();

        this.sendSessionUpdate();

        this.flushQueue();

        this.callbacks.onOpen?.();
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      ws.onerror = (err) => {
        console.error('[MiniMaxClient] WebSocket 异常:', err);
        this.callbacks.onError?.(err);
      };

      ws.onclose = (event) => {
        console.warn(`[MiniMaxClient] WebSocket 关闭 (code: ${event.code}, reason: ${event.reason})`);
        this.isConnected = false;
        this.stopKeepalive();
        this.callbacks.onClose?.(event.code, event.reason);

        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[MiniMaxClient] 初始化失败:', err);
      this.callbacks.onError?.(err);
      this.scheduleReconnect();
    }
  }

  public sendSessionUpdate(customConfig?: MiniMaxSessionConfig): void {
    const config = { ...this.options.sessionConfig, ...customConfig };
    const vadConfig = config.turnDetection !== undefined ? config.turnDetection : {
      type: 'server_vad',
      threshold: 0.32,
      prefix_padding_ms: 450,
      silence_duration_ms: 850,
      create_response: true,
    };

    const sessionPayload: Record<string, unknown> = {
      type: 'realtime',
      modalities: ['text', 'audio'],
      instructions: config.instructions || DEFAULT_VOICE_INSTRUCTIONS,
      voice: config.voice || DEFAULT_VOICE,
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: { model: 'whisper-1', language: 'zh' },
      turn_detection: vadConfig,
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: AUDIO_SAMPLE_RATE },
          transcription: { model: 'whisper-1' },
          turn_detection: vadConfig,
        },
        output: {
          format: { type: 'audio/pcm', rate: AUDIO_SAMPLE_RATE },
          voice: config.voice || DEFAULT_VOICE,
        },
      },
      tools: config.tools || CBT_VOICE_TOOLS,
    };

    this.send({
      type: 'session.update',
      session: sessionPayload,
    });
  }

  public updateTurnDetection(mode: 'speaking' | 'listening'): void {
    if (!this.ready) return;
    const vadConfig = mode === 'speaking'
      ? {
          type: 'server_vad',
          threshold: 0.75,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          create_response: true,
        }
      : {
          type: 'server_vad',
          threshold: 0.32,
          prefix_padding_ms: 450,
          silence_duration_ms: 850,
          create_response: true,
        };

    this.send({
      type: 'session.update',
      session: {
        turn_detection: vadConfig,
        audio: {
          input: {
            turn_detection: vadConfig,
          },
        },
      },
    });
  }

  public sendAudioChunk(pcm16Base64: string): void {
    if (!pcm16Base64) return;
    this.send({
      type: 'input_audio_buffer.append',
      audio: pcm16Base64,
    });
  }

  public commitAudio(): void {
    this.send({
      type: 'input_audio_buffer.commit',
    });
  }

  public truncateItem(itemId: string, audioEndMs: number, contentIndex: number = 0): void {
    if (!itemId) return;
    this.send({
      type: 'conversation.item.truncate',
      item_id: itemId,
      content_index: contentIndex,
      audio_end_ms: Math.max(0, audioEndMs),
    });
  }

  public interrupt(options?: { itemId?: string; audioEndMs?: number }): void {
    if (this.currentToolCallItemId) {
      this.send({
        type: 'conversation.item.delete',
        item_id: this.currentToolCallItemId,
      });
      this.currentToolCallItemId = null;
    }
    this.send({
      type: 'response.cancel',
    });
    const targetItemId = options?.itemId || this.currentResponseItemId;
    if (targetItemId && typeof options?.audioEndMs === 'number') {
      this.truncateItem(targetItemId, options.audioEndMs);
    }
  }

  public sendToolOutput(callId: string, output: Record<string, unknown>): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output),
      },
    });

    this.send({
      type: 'response.create',
    });
  }

  public send(payload: Record<string, unknown>): void {
    if (this.ready && this.ws) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        console.error('[MiniMaxClient] 发送帧失败:', err);
      }
    } else {
      this.messageQueue.push(payload);
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.stopKeepalive();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.isConnected = false;
  }

  private handleMessage(rawData: string | ArrayBuffer): void {
    if (typeof rawData !== 'string') return;

    try {
      const event = JSON.parse(rawData) as MiniMaxServerEvent;
      const type = event.type;

      if (
        type === 'response.output_item.added' ||
        type === 'response.output_audio.delta' ||
        type === 'response.audio.delta' ||
        type === 'response.audio_transcript.delta' ||
        type === 'response.output_audio_transcript.delta'
      ) {
        if (event.item_id) {
          this.currentResponseItemId = event.item_id;
        } else if (event.item?.id) {
          this.currentResponseItemId = event.item.id;
        }
      }

      if (type === 'response.output_audio.delta' || type === 'response.audio.delta') {
        const audio = event.delta || event.audio;
        if (audio) {
          this.callbacks.onAudioDelta?.(audio);
        }
      }

      if (
        type === 'response.output_text.delta' ||
        type === 'response.text.delta' ||
        type === 'response.output_audio_transcript.delta' ||
        type === 'response.audio_transcript.delta'
      ) {
        const text = event.delta || event.text || event.transcript || (event as any).transcript;
        if (text) {
          this.callbacks.onTextDelta?.(text);
        }
      }

      if (type === 'conversation.item.input_audio_transcription.completed') {
        const transcript = event.transcript || (event as any).transcript;
        if (transcript) {
          this.callbacks.onTranscriptDelta?.(transcript);
        }
      }

      if (type === 'input_audio_buffer.speech_started') {
        const targetItemId = event.item_id || this.currentResponseItemId;
        this.callbacks.onSpeechStarted?.({
          audioStartMs: event.audio_start_ms,
          itemId: targetItemId || undefined,
        });
      }

      if (type === 'response.created') {
        this.callbacks.onTurnStart?.();
      }

      if (type === 'response.done') {
        this.callbacks.onTurnEnd?.();
        this.currentResponseItemId = null;
      }

      if (
        type === 'response.function_call_arguments.done' ||
        (event.item?.type === 'function_call' && event.item?.content)
      ) {
        const name = event.name || (event.item as any)?.name;
        const callId = event.call_id || (event.item as any)?.call_id;
        const argsStr = event.arguments || (event.item as any)?.arguments || '{}';

        if (name && callId) {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(argsStr);
          } catch {
            parsedArgs = { raw: argsStr };
          }
          this.callbacks.onToolCall?.({ name, callId, args: parsedArgs });
        }
      }

      if (
        type === 'response.function_call_arguments.delta' ||
        (type === 'response.output_item.added' && (event.item?.type === 'function_call' || event.item?.type === 'function_call_output'))
      ) {
        const itemId = event.item_id || event.item?.id;
        if (itemId) {
          this.currentToolCallItemId = itemId;
        }
      }

      if (type === 'response.function_call_arguments.done') {
        this.currentToolCallItemId = null;
      }

      if (type === 'conversation.item.truncated') {
        this.callbacks.onItemTruncated?.({
          itemId: event.item_id,
          audioEndMs: event.audio_end_ms,
        });
      }

      if (type === 'error') {
        const errCode = event.error?.code;
        if (errCode === 'response_cancel_not_allowed') {
          return;
        }
        console.error('[MiniMaxClient] 收到服务端错误:', event.error);
        this.callbacks.onError?.(event.error);
      }
    } catch (err) {
      console.warn('[MiniMaxClient] 解析下行帧失败:', err);
    }
  }

  private flushQueue(): void {
    if (!this.ready || !this.ws) return;
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (msg) {
        try {
          this.ws.send(JSON.stringify(msg));
        } catch (e) {
          console.error('[MiniMaxClient] 排空发送队列失败:', e);
        }
      }
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();

    this.keepaliveTimer = setInterval(() => {
      if (this.ready) {

        this.send({ type: 'client.ping' });
      }
    }, 30000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private scheduleReconnect(): void {
    const maxAttempts = this.options.maxReconnectAttempts ?? 3;
    if (this.reconnectAttempts >= maxAttempts) {
      console.error('[MiniMaxClient] 已达最大重连次数，停止重连');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
    console.log(`[MiniMaxClient] 将在 ${delay}ms 后进行第 ${this.reconnectAttempts} 次重连...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cleanupSocket(): void {
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'Client closed');
        }
      } catch {

      }
      this.ws = null;
    }
  }
}
