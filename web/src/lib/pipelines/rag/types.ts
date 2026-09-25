export interface RagChunk {
  id: string;
  title: string;
  content: string;
  score: number;
  tags?: string[];
  category?: string;
  empathyLead?: string;
  socraticPivot?: string;
  tabooPhrases?: string[];
}

export interface RagQueryOptions {
  topK?: number;
  minScore?: number;
  stageFilter?: string;
}

export interface IRagProvider {
  readonly name: string;

  retrieve(query: string, options?: RagQueryOptions): Promise<RagChunk[]>;

  formatContext(chunks: RagChunk[]): string;
}
