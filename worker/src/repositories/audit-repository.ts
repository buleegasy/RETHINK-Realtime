import type { Env, CrisisAuditLog } from '../types';

let isAuditSchemaInitialized = false;
const memoryAuditLogs: CrisisAuditLog[] = [];

export async function ensureAuditSchemaOnce(db?: D1Database): Promise<void> {
  if (isAuditSchemaInitialized || !db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS crisis_audit_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        operator_name TEXT,
        reason TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `).run();
    isAuditSchemaInitialized = true;
  } catch {
    isAuditSchemaInitialized = true;
  }
}

export class AuditRepository {
  public static async record(
    env: Env,
    payload: { session_id: string; operator_name: string; reason: string; created_at?: number },
    prefix: string = 'audit'
  ): Promise<CrisisAuditLog> {
    const auditLog: CrisisAuditLog = {
      id: `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      session_id: payload.session_id,
      operator_name: payload.operator_name,
      reason: payload.reason,
      created_at: payload.created_at ?? Math.floor(Date.now() / 1000),
    };
    memoryAuditLogs.unshift(auditLog);

    if (env.DB) {
      try {
        await ensureAuditSchemaOnce(env.DB);
        await env.DB.prepare(
          'INSERT INTO crisis_audit_logs (id, session_id, operator_name, reason, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          auditLog.id,
          auditLog.session_id,
          auditLog.operator_name,
          auditLog.reason,
          auditLog.created_at
        ).run();
      } catch (e) {
        console.warn('[AuditRepository record error]:', e);
      }
    }

    return auditLog;
  }

  public static async findBySessionId(env: Env, sessionId: string): Promise<CrisisAuditLog[]> {
    if (env.DB) {
      try {
        await ensureAuditSchemaOnce(env.DB);
        const { results } = await env.DB.prepare(
          'SELECT * FROM crisis_audit_logs WHERE session_id = ? ORDER BY created_at DESC'
        ).bind(sessionId).all<CrisisAuditLog>();
        if (results && results.length >= 0) {
          return results;
        }
      } catch (e) {
        console.warn('[AuditRepository findBySessionId error]:', e);
      }
    }

    return memoryAuditLogs.filter((log) => log.session_id === sessionId);
  }

  public static async findAll(env: Env, limit: number = 200): Promise<CrisisAuditLog[]> {
    if (env.DB) {
      try {
        await ensureAuditSchemaOnce(env.DB);
        const { results } = await env.DB.prepare(
          'SELECT * FROM crisis_audit_logs ORDER BY created_at DESC LIMIT ?'
        ).bind(limit).all<CrisisAuditLog>();
        if (results && results.length >= 0) {
          return results;
        }
      } catch (e) {
        console.warn('[AuditRepository findAll error]:', e);
      }
    }

    return memoryAuditLogs.slice(0, limit);
  }
}
