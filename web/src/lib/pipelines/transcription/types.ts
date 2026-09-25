export interface TranscriptSegment {
  id: string;
  speaker: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export type TranscriptSubscriber = (segment: TranscriptSegment) => void;

export interface ITranscriptionPipeline {
  readonly name: string;

  feedDelta(speaker: 'user' | 'assistant', delta: string): void;

  finalizeCurrentTurn(speaker: 'user' | 'assistant'): TranscriptSegment | null;

  subscribe(listener: TranscriptSubscriber): () => void;

  getHistory(): TranscriptSegment[];

  reset(): void;
}
