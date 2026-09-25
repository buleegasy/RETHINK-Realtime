import type { DialogueTurn } from '../../../types';

export interface ContextCompressionOptions {
  tokenBudget?: number;      
  keepLastTurns?: number;    
  preserveFirstTurn?: boolean;
}

export interface CompressionResult {
  compressedTurns: DialogueTurn[];
  hasCompressed: boolean;
  originalCount: number;
  compressedCount: number;
  estimatedTokens: number;
  summaryBlock?: string;
}

export interface IContextManager {
  readonly name: string;

  compress(turns: DialogueTurn[], options?: ContextCompressionOptions): Promise<CompressionResult>;

  estimateTokens(textOrTurns: string | DialogueTurn[]): number;
}
