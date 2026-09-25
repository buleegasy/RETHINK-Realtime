export interface MiniMaxSessionConfig {
  modalities?: ('text' | 'audio')[];
  instructions?: string;
  voice?: string;
  speed?: number;
  inputAudioFormat?: 'pcm16';
  outputAudioFormat?: 'pcm16';
  turnDetection?: {
    type: 'server_vad';
    threshold?: number;
    prefixPaddingMs?: number;
    silenceDurationMs?: number;
  } | null;
  tools?: Record<string, unknown>[];
}

export interface MiniMaxServerEvent {
  type: string;
  event_id?: string;
  delta?: string;
  text?: string;
  audio?: string;
  transcript?: string;
  item?: {
    id?: string;
    type?: string;
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      transcript?: string;
    }>;
  };
  response?: {
    id?: string;
    status?: string;
    output?: Array<Record<string, unknown>>;
  };
  name?: string;
  call_id?: string;
  arguments?: string;
  error?: {
    message: string;
    code?: string;
  };
  [key: string]: unknown;
}

export interface MiniMaxClientCallbacks {
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (err: unknown) => void;
  onAudioDelta?: (pcm16Base64: string) => void;
  onTextDelta?: (text: string) => void;
  onTranscriptDelta?: (transcript: string) => void;
  onTurnStart?: () => void;
  onTurnEnd?: () => void;
  onToolCall?: (toolCall: { name: string; callId: string; args: Record<string, unknown> }) => void;
}
