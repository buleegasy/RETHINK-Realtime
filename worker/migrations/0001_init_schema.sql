-- RETHINK Realtime Database Migration: 0001_init_schema.sql
-- 校园心理健康系统会话建档与危机审计表

CREATE TABLE IF NOT EXISTS school_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT UNIQUE,
  duration INTEGER DEFAULT 0,
  stage TEXT,
  is_crisis INTEGER DEFAULT 0,
  crisis_level INTEGER DEFAULT 0,
  crisis_summary TEXT,
  core_concerns TEXT,
  emotional_valence REAL DEFAULT 0,
  encrypted_real_identity TEXT,
  deidentified_report TEXT,
  disposition_status TEXT DEFAULT 'pending_contact',
  disposition_note TEXT,
  is_deleted INTEGER DEFAULT 0,
  deleted_at INTEGER DEFAULT NULL,
  delete_reason TEXT DEFAULT NULL,
  deleted_by TEXT DEFAULT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_sessions_session_id ON school_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_school_sessions_crisis ON school_sessions(is_crisis, is_deleted);
CREATE INDEX IF NOT EXISTS idx_school_sessions_created_at ON school_sessions(created_at);

CREATE TABLE IF NOT EXISTS crisis_audit_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  operator_name TEXT,
  reason TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_crisis_audit_logs_session_id ON crisis_audit_logs(session_id);
