export interface Env {
  MINIMAX_API_KEY?: string;
  APIYI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DB?: D1Database;
  ENVIRONMENT?: string;
  TEACHER_SECONDARY_PASSCODE?: string;
  CRISIS_WEBHOOK_URL?: string;
}

export type CrisisLevel = 0 | 1 | 2 | 3;

export type DispositionStatus = 'pending_contact' | 'intervened' | 'closed';

export interface SessionRecord {
  id: string;
  session_id: string;
  duration: number;
  stage: string;
  is_crisis: number;
  crisis_level: CrisisLevel;
  crisis_summary?: string;
  core_concerns?: string;
  emotional_valence?: number;
  encrypted_real_identity?: string;
  deidentified_report?: string;
  disposition_status?: DispositionStatus;
  disposition_note?: string;
  created_at: number;
}

export interface CrisisAuditLog {
  id: string;
  session_id: string;
  operator_name: string;
  reason: string;
  created_at: number;
}

export interface PersistSessionPayload {
  session_id: string;
  duration: number;
  encrypted_payload: string;
  stage: string;
  username?: string;
  transcript_text?: string;
  crisis_level?: CrisisLevel;
  is_crisis?: boolean;
}

export interface KnowledgeQueryPayload {
  query: string;
  topK?: number;
}

export interface TeacherAuthPayload {
  username?: string;
  password?: string;
}

export interface CrisisUnmaskPayload {
  session_id: string;
  secondary_passcode: string;
  operator_name?: string;
}

export interface DispositionPayload {
  session_id: string;
  status: DispositionStatus;
  note?: string;
}

export interface WebhookTestPayload {
  webhook_url: string;
  provider?: string;
}

