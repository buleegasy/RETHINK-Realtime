import type { DialogueTurn, SanitizedCbtReport, CBTStage } from '../../../types';

export interface ReportGenerationInput {
  sessionId: string;
  durationSeconds: number;
  stageReached: CBTStage;
  rawUserName?: string;
  turns: DialogueTurn[];
}

export interface IReportGenerator {
  readonly name: string;

  generate(input: ReportGenerationInput): Promise<SanitizedCbtReport>;

  deidentifyText(text: string): string;
}
