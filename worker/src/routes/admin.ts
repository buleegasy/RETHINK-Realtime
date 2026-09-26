import { Hono } from 'hono';
import type {
  Env,
  SessionRecord,
  CrisisAuditLog,
  TeacherAuthPayload,
  CrisisUnmaskPayload,
  DispositionPayload,
  WebhookTestPayload,
  DeleteSessionPayload,
  RestoreSessionPayload,
} from '../types';
import { decryptAesGcm } from '../lib/crypto-helper';
import { sendCrisisWebhook } from '../lib/webhook-sender';

export const adminRouter = new Hono<{ Bindings: Env }>();

const memorySessions: SessionRecord[] = [];
const memoryAuditLogs: CrisisAuditLog[] = [];

async function ensureDbTables(db: D1Database): Promise<void> {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS school_sessions (
        id TEXT PRIMARY KEY,
        session_id TEXT UNIQUE,
        duration INTEGER,
        stage TEXT,
        is_crisis INTEGER DEFAULT 0,
        crisis_level INTEGER DEFAULT 0,
        crisis_summary TEXT,
        core_concerns TEXT,
        emotional_valence REAL,
        encrypted_real_identity TEXT,
        deidentified_report TEXT,
        disposition_status TEXT DEFAULT 'pending_contact',
        disposition_note TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER DEFAULT NULL,
        delete_reason TEXT DEFAULT NULL,
        deleted_by TEXT DEFAULT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `).run();
    try {
      await db.prepare('ALTER TABLE school_sessions ADD COLUMN is_deleted INTEGER DEFAULT 0').run();
    } catch {}
    try {
      await db.prepare('ALTER TABLE school_sessions ADD COLUMN deleted_at INTEGER DEFAULT NULL').run();
    } catch {}
    try {
      await db.prepare('ALTER TABLE school_sessions ADD COLUMN delete_reason TEXT DEFAULT NULL').run();
    } catch {}
    try {
      await db.prepare('ALTER TABLE school_sessions ADD COLUMN deleted_by TEXT DEFAULT NULL').run();
    } catch {}
  } catch {}
}

async function ensureAuditTable(db: D1Database): Promise<void> {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS crisis_audit_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        operator_name TEXT,
        reason TEXT,
        created_at INTEGER
      )
    `).run();
  } catch {}
}

export async function addSessionRecordToStore(env: Env, record: SessionRecord): Promise<void> {
  const existingIdx = memorySessions.findIndex((s) => s.session_id === record.session_id);
  if (existingIdx >= 0) {
    memorySessions[existingIdx] = { ...memorySessions[existingIdx], ...record };
  } else {
    memorySessions.unshift(record);
  }

  if (env.DB) {
    try {
      await ensureDbTables(env.DB);
      await env.DB.prepare(`
        INSERT INTO school_sessions (
          id, session_id, duration, stage, is_crisis, crisis_level,
          crisis_summary, core_concerns, emotional_valence,
          encrypted_real_identity, deidentified_report, disposition_status, disposition_note,
          is_deleted, deleted_at, delete_reason, deleted_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          duration = excluded.duration,
          stage = excluded.stage,
          is_crisis = excluded.is_crisis,
          crisis_level = excluded.crisis_level,
          crisis_summary = excluded.crisis_summary,
          core_concerns = excluded.core_concerns,
          emotional_valence = excluded.emotional_valence,
          encrypted_real_identity = excluded.encrypted_real_identity,
          deidentified_report = excluded.deidentified_report,
          disposition_status = excluded.disposition_status,
          disposition_note = excluded.disposition_note
      `).bind(
        record.id,
        record.session_id,
        record.duration,
        record.stage,
        record.is_crisis,
        record.crisis_level,
        record.crisis_summary || '',
        record.core_concerns || '[]',
        record.emotional_valence || 0,
        record.encrypted_real_identity || '',
        record.deidentified_report || '',
        record.disposition_status || 'pending_contact',
        record.disposition_note || '',
        record.is_deleted || 0,
        record.deleted_at || null,
        record.delete_reason || null,
        record.deleted_by || null,
        record.created_at
      ).run();
    } catch (e) {
      console.warn('[D1 School Sessions Error]:', e);
    }
  }
}

adminRouter.post('/login', async (c) => {
  let body: TeacherAuthPayload = {};
  try {
    body = await c.req.json<TeacherAuthPayload>();
  } catch {
    body = {};
  }

  const { username, password } = body;
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return c.json({ success: false, error: '请输入有效的教师账号与密码' }, 400);
  }

  const cleanUser = username.trim();
  if (cleanUser.length < 2) {
    return c.json({ success: false, error: '账号格式不正确' }, 400);
  }

  const token = `teacher_token_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const user = {
    uid: `teacher_${cleanUser}`,
    username: cleanUser,
    displayName: cleanUser === 'teacher' ? '校心理专职教师' : `${cleanUser}老师`,
    role: 'teacher',
    permissions: ['view_macro_pulse', 'view_deidentified_reports', 'crisis_audit_unmask'],
    isAuthenticated: true,
  };

  return c.json({
    success: true,
    token,
    user,
  });
});

adminRouter.get('/stats', async (c) => {
  const env = c.env || {};
  let allSessions = memorySessions.filter((s) => !s.is_deleted);
  if (env.DB) {
    try {
      await ensureDbTables(env.DB);
      const { results } = await env.DB.prepare(
        'SELECT * FROM school_sessions WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 500'
      ).all<SessionRecord>();
      if (results) {
        allSessions = results;
      }
    } catch {
      allSessions = memorySessions.filter((s) => !s.is_deleted);
    }
  }

  const totalSessions = allSessions.length;
  const crisisCount = allSessions.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3).length;
  const pendingInterventions = allSessions.filter(
    (s) => (s.is_crisis === 1 || s.crisis_level >= 3) && s.disposition_status === 'pending_contact'
  ).length;

  const validValences = allSessions
    .map((s) => s.emotional_valence)
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const avgValence = validValences.length > 0
    ? Number((validValences.reduce((acc, curr) => acc + curr, 0) / validValences.length).toFixed(2))
    : 0.0;

  const concernCounts: Record<string, number> = {};
  for (const s of allSessions) {
    try {
      const parsed = JSON.parse(s.core_concerns || '[]');
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string' && item.trim()) {
            concernCounts[item] = (concernCounts[item] || 0) + 1;
          }
        }
      }
    } catch {}
  }

  const concernDistribution = Object.entries(concernCounts).map(([name, count]) => ({
    name,
    count,
  }));

  const riskDistribution = [
    { level: 0, label: '正常稳定', count: allSessions.filter((s) => (s.crisis_level || 0) === 0).length },
    { level: 1, label: '轻度波动', count: allSessions.filter((s) => s.crisis_level === 1).length },
    { level: 2, label: '中度压力', count: allSessions.filter((s) => s.crisis_level === 2).length },
    { level: 3, label: '极高危预警', count: allSessions.filter((s) => (s.crisis_level || 0) >= 3 || s.is_crisis === 1).length },
  ];

  const now = new Date();
  const weeklyTrend = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(now.getTime() - (6 - idx) * 86400000);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const daySessions = allSessions.filter((s) => {
      const sDate = new Date(s.created_at * 1000);
      return (
        sDate.getDate() === d.getDate() &&
        sDate.getMonth() === d.getMonth() &&
        sDate.getFullYear() === d.getFullYear()
      );
    });
    const dayValences = daySessions
      .map((s) => s.emotional_valence)
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));
    const dayAvgValence = dayValences.length > 0
      ? Number((dayValences.reduce((acc, curr) => acc + curr, 0) / dayValences.length).toFixed(2))
      : 0.0;

    return {
      date: dateStr,
      sessions: daySessions.length,
      crisis: daySessions.filter((s) => s.crisis_level === 3 || s.is_crisis === 1).length,
      avgValence: dayAvgValence,
    };
  });

  return c.json({
    success: true,
    stats: {
      totalSessions,
      crisisCount,
      pendingInterventions,
      avgValence,
      concernDistribution,
      riskDistribution,
      weeklyTrend,
    },
  });
});

adminRouter.get('/sessions', async (c) => {
  const env = c.env || {};
  const includeDeleted = c.req.query('includeDeleted') === 'true';
  const queryCrisis = c.req.query('crisisOnly');

  let sessions = memorySessions;
  if (env.DB) {
    try {
      await ensureDbTables(env.DB);
      const sql = includeDeleted
        ? 'SELECT * FROM school_sessions ORDER BY created_at DESC LIMIT 200'
        : 'SELECT * FROM school_sessions WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 200';
      const { results } = await env.DB.prepare(sql).all<SessionRecord>();
      if (results) {
        sessions = results;
      }
    } catch {
      sessions = memorySessions;
    }
  }

  let filtered = includeDeleted ? sessions : sessions.filter((s) => !s.is_deleted);
  if (queryCrisis === 'true' || queryCrisis === '1') {
    filtered = filtered.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3);
  }

  const safeSessions = filtered.map((s) => {
    let reportObj: any = null;
    try {
      reportObj = JSON.parse(s.deidentified_report || '{}');
    } catch {
      reportObj = null;
    }

    let coreConcerns: string[] = [];
    try {
      coreConcerns = JSON.parse(s.core_concerns || '[]');
    } catch {
      coreConcerns = [];
    }

    return {
      id: s.id,
      sessionId: s.session_id,
      duration: s.duration,
      stage: s.stage,
      isCrisis: s.is_crisis === 1,
      crisisLevel: s.crisis_level,
      crisisSummary: s.crisis_summary || '',
      coreConcerns,
      emotionalValence: s.emotional_valence ?? 0,
      deidentifiedReport: reportObj,
      dispositionStatus: s.disposition_status || 'pending_contact',
      dispositionNote: s.disposition_note || '',
      isDeleted: s.is_deleted === 1,
      deletedAt: s.deleted_at || null,
      deleteReason: s.delete_reason || null,
      deletedBy: s.deleted_by || null,
      createdAt: s.created_at,
      hasEncryptedIdentity: Boolean(s.encrypted_real_identity),
    };
  });

  return c.json({
    success: true,
    sessions: safeSessions,
  });
});

adminRouter.get('/crises', async (c) => {
  const env = c.env || {};
  let sessions = memorySessions.filter((s) => !s.is_deleted && (s.is_crisis === 1 || s.crisis_level >= 3));
  if (env.DB) {
    try {
      await ensureDbTables(env.DB);
      const { results } = await env.DB.prepare(
        'SELECT * FROM school_sessions WHERE is_deleted = 0 AND (is_crisis = 1 OR crisis_level >= 3) ORDER BY created_at DESC LIMIT 100'
      ).all<SessionRecord>();
      if (results) {
        sessions = results;
      }
    } catch {
      sessions = memorySessions.filter((s) => !s.is_deleted && (s.is_crisis === 1 || s.crisis_level >= 3));
    }
  }

  return c.json({
    success: true,
    crises: sessions.map((s) => {
      let coreConcerns: string[] = [];
      try {
        coreConcerns = JSON.parse(s.core_concerns || '[]');
      } catch {
        coreConcerns = [];
      }
      return {
        sessionId: s.session_id,
        duration: s.duration,
        crisisLevel: s.crisis_level,
        crisisSummary: s.crisis_summary || '',
        coreConcerns,
        emotionalValence: s.emotional_valence ?? 0,
        dispositionStatus: s.disposition_status || 'pending_contact',
        dispositionNote: s.disposition_note || '',
        createdAt: s.created_at,
        hasEncryptedIdentity: Boolean(s.encrypted_real_identity),
      };
    }),
  });
});

adminRouter.post('/crisis/unmask', async (c) => {
  let body: CrisisUnmaskPayload = { session_id: '', secondary_passcode: '' };
  try {
    body = await c.req.json<CrisisUnmaskPayload>();
  } catch {
    body = { session_id: '', secondary_passcode: '' };
  }

  const { session_id, secondary_passcode, operator_name } = body;
  if (!session_id || !secondary_passcode) {
    return c.json({ success: false, error: '缺少会话标识或二次安全口令' }, 400);
  }

  const env = c.env || {};
  const correctPasscode = env.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';

  if (secondary_passcode.trim() !== correctPasscode) {
    return c.json({
      success: false,
      error: '二次安全口令错误。为保护学生隐私，系统已拒绝解除脱敏并记录本次异常操作。',
    }, 403);
  }

  let target = memorySessions.find((s) => s.session_id === session_id);
  if (!target && env.DB) {
    try {
      await ensureDbTables(env.DB);
      target = await env.DB.prepare('SELECT * FROM school_sessions WHERE session_id = ?')
        .bind(session_id)
        .first<SessionRecord>() || undefined;
    } catch {
      target = undefined;
    }
  }

  if (!target) {
    return c.json({ success: false, error: '未找到该危机事件记录' }, 404);
  }

  if (!target.encrypted_real_identity) {
    return c.json({ success: false, error: '该危机记录未包含加密学生身份数据，无法解密' }, 400);
  }

  let realIdentityObj: any = null;
  try {
    const decryptedStr = await decryptAesGcm(target.encrypted_real_identity, correctPasscode);
    realIdentityObj = JSON.parse(decryptedStr);
  } catch {
    return c.json({ success: false, error: '身份数据解密失败，安全口令或加密密钥不匹配' }, 500);
  }

  const auditLog: CrisisAuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    session_id,
    operator_name: (operator_name && operator_name.trim()) || '心理专职教师',
    reason: '自杀/自残危机紧急线下干预穿透查看',
    created_at: Math.floor(Date.now() / 1000),
  };
  memoryAuditLogs.unshift(auditLog);

  if (env.DB) {
    try {
      await ensureAuditTable(env.DB);
      await env.DB.prepare(
        'INSERT INTO crisis_audit_logs (id, session_id, operator_name, reason, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(auditLog.id, auditLog.session_id, auditLog.operator_name, auditLog.reason, auditLog.created_at).run();
    } catch (e) {
      console.warn('[D1 Audit Insert Error]:', e);
    }
  }

  return c.json({
    success: true,
    session_id,
    realIdentity: realIdentityObj,
    auditLog,
  });
});

adminRouter.post('/crisis/disposition', async (c) => {
  let body: DispositionPayload = { session_id: '', status: 'pending_contact' };
  try {
    body = await c.req.json<DispositionPayload>();
  } catch {
    body = { session_id: '', status: 'pending_contact' };
  }

  const { session_id, status, note } = body;
  if (!session_id || !status) {
    return c.json({ success: false, error: '缺少会话标识或处置状态' }, 400);
  }

  const target = memorySessions.find((s) => s.session_id === session_id);
  if (target) {
    target.disposition_status = status;
    if (note !== undefined) target.disposition_note = note;
  }

  const env = c.env || {};
  if (env.DB) {
    try {
      await ensureDbTables(env.DB);
      await env.DB.prepare(
        'UPDATE school_sessions SET disposition_status = ?, disposition_note = ? WHERE session_id = ?'
      ).bind(status, note || '', session_id).run();
    } catch (e) {
      console.warn('[D1 Disposition Update Error]:', e);
    }
  }

  return c.json({
    success: true,
    session_id,
    status,
    note: note || '',
  });
});

adminRouter.post('/sessions/delete', async (c) => {
  let body: DeleteSessionPayload = { session_id: '', secondary_passcode: '', reason: '' };
  try {
    body = await c.req.json<DeleteSessionPayload>();
  } catch {
    body = { session_id: '', secondary_passcode: '', reason: '' };
  }

  const { session_id, secondary_passcode, reason, operator_name } = body;
  if (!session_id || !secondary_passcode) {
    return c.json({ success: false, error: '缺少会话编号或二次安全口令' }, 400);
  }

  const env = c.env || {};
  const correctPasscode = env.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';

  if (secondary_passcode.trim() !== correctPasscode) {
    return c.json({
      success: false,
      error: '二次安全口令错误，已阻止删除操作并记入安全审计日志。',
    }, 403);
  }

  if (!reason || reason.trim().length < 2) {
    return c.json({ success: false, error: '必须填写有效的删除/归档事由（至少2个字）' }, 400);
  }

  const cleanOperator = (operator_name && operator_name.trim()) || '心理专职教师';
  const cleanReason = reason.trim();
  const deletedAt = Math.floor(Date.now() / 1000);

  const memTarget = memorySessions.find((s) => s.session_id === session_id);
  if (memTarget) {
    memTarget.is_deleted = 1;
    memTarget.deleted_at = deletedAt;
    memTarget.delete_reason = cleanReason;
    memTarget.deleted_by = cleanOperator;
  }

  if (env.DB) {
    try {
      await ensureDbTables(env.DB);
      await env.DB.prepare(
        'UPDATE school_sessions SET is_deleted = 1, deleted_at = ?, delete_reason = ?, deleted_by = ? WHERE session_id = ?'
      ).bind(deletedAt, cleanReason, cleanOperator, session_id).run();
    } catch (e) {
      console.warn('[D1 Soft Delete Error]:', e);
    }
  }

  const auditLog: CrisisAuditLog = {
    id: `audit_del_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    session_id,
    operator_name: cleanOperator,
    reason: `[安全归档/软删除] ${cleanReason}`,
    created_at: deletedAt,
  };
  memoryAuditLogs.unshift(auditLog);

  if (env.DB) {
    try {
      await ensureAuditTable(env.DB);
      await env.DB.prepare(
        'INSERT INTO crisis_audit_logs (id, session_id, operator_name, reason, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(auditLog.id, auditLog.session_id, auditLog.operator_name, auditLog.reason, auditLog.created_at).run();
    } catch (e) {
      console.warn('[D1 Audit Insert Error]:', e);
    }
  }

  return c.json({
    success: true,
    session_id,
    message: '记录已安全归档，数据已底层保留并记入安全审计日志。',
  });
});

adminRouter.post('/sessions/restore', async (c) => {
  let body: RestoreSessionPayload = { session_id: '', secondary_passcode: '' };
  try {
    body = await c.req.json<RestoreSessionPayload>();
  } catch {
    body = { session_id: '', secondary_passcode: '' };
  }

  const { session_id, secondary_passcode, operator_name } = body;
  if (!session_id || !secondary_passcode) {
    return c.json({ success: false, error: '缺少会话编号或二次安全口令' }, 400);
  }

  const env = c.env || {};
  const correctPasscode = env.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';

  if (secondary_passcode.trim() !== correctPasscode) {
    return c.json({
      success: false,
      error: '二次安全口令错误，已阻止恢复操作。',
    }, 403);
  }

  const cleanOperator = (operator_name && operator_name.trim()) || '心理专职教师';
  const memTarget = memorySessions.find((s) => s.session_id === session_id);
  if (memTarget) {
    memTarget.is_deleted = 0;
    memTarget.deleted_at = undefined;
    memTarget.delete_reason = undefined;
    memTarget.deleted_by = undefined;
  }

  if (env.DB) {
    try {
      await ensureDbTables(env.DB);
      await env.DB.prepare(
        'UPDATE school_sessions SET is_deleted = 0, deleted_at = NULL, delete_reason = NULL, deleted_by = NULL WHERE session_id = ?'
      ).bind(session_id).run();
    } catch (e) {
      console.warn('[D1 Restore Error]:', e);
    }
  }

  const auditLog: CrisisAuditLog = {
    id: `audit_res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    session_id,
    operator_name: cleanOperator,
    reason: '[恢复个案档案记录]',
    created_at: Math.floor(Date.now() / 1000),
  };
  memoryAuditLogs.unshift(auditLog);

  if (env.DB) {
    try {
      await ensureAuditTable(env.DB);
      await env.DB.prepare(
        'INSERT INTO crisis_audit_logs (id, session_id, operator_name, reason, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(auditLog.id, auditLog.session_id, auditLog.operator_name, auditLog.reason, auditLog.created_at).run();
    } catch (e) {
      console.warn('[D1 Audit Insert Error]:', e);
    }
  }

  return c.json({
    success: true,
    session_id,
    message: '记录已成功恢复。',
  });
});

adminRouter.get('/audit-logs', async (c) => {
  const env = c.env || {};
  let logs = memoryAuditLogs;
  if (env.DB) {
    try {
      await ensureAuditTable(env.DB);
      const { results } = await env.DB.prepare(
        'SELECT * FROM crisis_audit_logs ORDER BY created_at DESC LIMIT 200'
      ).all<CrisisAuditLog>();
      if (results && results.length > 0) {
        logs = results;
      }
    } catch {}
  }
  return c.json({
    success: true,
    logs,
  });
});

adminRouter.post('/webhook/test', async (c) => {
  let body: WebhookTestPayload = { webhook_url: '' };
  try {
    body = await c.req.json<WebhookTestPayload>();
  } catch {
    body = { webhook_url: '' };
  }

  if (!body.webhook_url || !body.webhook_url.startsWith('http')) {
    return c.json({ success: false, error: '请输入有效的 Webhook 地址 (以 http/https 开头)' }, 400);
  }

  const result = await sendCrisisWebhook(body.webhook_url, {
    sessionId: `test_crisis_${Date.now()}`,
    crisisSummary: '【测试演练】电话亭高危触发联调测试',
    crisisLevel: 3,
    occurredAt: new Date().toLocaleString('zh-CN'),
    boothLocation: '校园心理驿站#01 (测试演练)',
    coreConcerns: ['联调演练', '通道测试'],
  });

  return c.json({
    success: result.success,
    error: result.error,
  });
});
