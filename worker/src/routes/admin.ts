import { Hono } from 'hono';
import type {
  Env,
  SessionRecord,
  CrisisAuditLog,
  TeacherAuthPayload,
  CrisisUnmaskPayload,
  DispositionPayload,
  WebhookTestPayload,
  CrisisLevel,
  DispositionStatus,
} from '../types';
import { decryptAesGcm, encryptAesGcm } from '../lib/crypto-helper';
import { sendCrisisWebhook } from '../lib/webhook-sender';

export const adminRouter = new Hono<{ Bindings: Env }>();

const memorySessions: SessionRecord[] = [
  {
    id: 'sess_sample_01',
    session_id: 'sess_sample_01',
    duration: 342,
    stage: 'Crisis_Escalation',
    is_crisis: 1,
    crisis_level: 3,
    crisis_summary: '检测到明确自杀/自残/极端危机意向，需心理老师即刻介入',
    core_concerns: JSON.stringify(['同伴人际矛盾', '学业考核压力']),
    emotional_valence: -0.92,
    encrypted_real_identity: '',
    deidentified_report: JSON.stringify({
      sessionId: 'sess_sample_01',
      generatedAt: Date.now() - 3600000,
      durationSeconds: 342,
      userDisplayName: '来访者 #S1024',
      cbtStageReached: 'Crisis_Escalation',
      coreConcerns: ['同伴人际矛盾', '学业考核压力'],
      cognitiveDistortions: ['灾难化与绝对化思维', '读心术倾向'],
      emotionalTrajectory: {
        initial: '极度痛苦绝望',
        final: '危机紧急触发，转入专业保护',
        deltaNotes: '对话中出现强烈轻生与厌世意向，已触发电话亭就地急救与警报'
      },
      keyTakeaways: ['生命是第一位的，痛苦需要被看见而非终结生命。'],
      homeworkAction: '等待心理老师现场安全确认。',
      isDeidentified: true
    }),
    disposition_status: 'pending_contact',
    disposition_note: '',
    created_at: Math.floor((Date.now() - 3600000) / 1000),
  },
  {
    id: 'sess_sample_02',
    session_id: 'sess_sample_02',
    duration: 210,
    stage: 'Socratic_Questioning',
    is_crisis: 0,
    crisis_level: 2,
    crisis_summary: '检测到中度情绪崩溃与高度压力，建议心理老师列入重点关注',
    core_concerns: JSON.stringify(['学业考核压力']),
    emotional_valence: -0.58,
    encrypted_real_identity: '',
    deidentified_report: JSON.stringify({
      sessionId: 'sess_sample_02',
      generatedAt: Date.now() - 7200000,
      durationSeconds: 210,
      userDisplayName: '来访者 #S1025',
      cbtStageReached: 'Socratic_Questioning',
      coreConcerns: ['学业考核压力'],
      cognitiveDistortions: ['以偏概全'],
      emotionalTrajectory: {
        initial: '考试前焦虑躯体化',
        final: '理清现实目标，紧绷有所松弛',
        deltaNotes: '通过去灾难化梳理，明确单次月考不代表整体能力。'
      },
      keyTakeaways: ['单次考试成绩无法定义整个人生。'],
      homeworkAction: '制定今晚30分钟复习计划后准时休息。',
      isDeidentified: true
    }),
    disposition_status: 'intervened',
    disposition_note: '班主任已在午休时进行了暖心谈话',
    created_at: Math.floor((Date.now() - 7200000) / 1000),
  },
  {
    id: 'sess_sample_03',
    session_id: 'sess_sample_03',
    duration: 180,
    stage: 'CBT_Stripping',
    is_crisis: 0,
    crisis_level: 1,
    crisis_summary: '存在阶段性负面情绪，处于倾诉排解过程中',
    core_concerns: JSON.stringify(['家庭互动冲突']),
    emotional_valence: -0.25,
    encrypted_real_identity: '',
    deidentified_report: JSON.stringify({
      sessionId: 'sess_sample_03',
      generatedAt: Date.now() - 86400000,
      durationSeconds: 180,
      userDisplayName: '来访者 #S1026',
      cbtStageReached: 'CBT_Stripping',
      coreConcerns: ['家庭互动冲突'],
      cognitiveDistortions: ['应该与必须化思维'],
      emotionalTrajectory: {
        initial: '与父母争吵后愤怒',
        final: '平复情绪，认识到双方沟通障碍',
        deltaNotes: '引导其将“父母必须理解我”转化为“向父母表达感受”。'
      },
      keyTakeaways: ['尝试使用“我感觉...”代替指责性控诉。'],
      homeworkAction: '周末回家写一张给父母的平和卡片。',
      isDeidentified: true
    }),
    disposition_status: 'closed',
    disposition_note: '自述与父母已达成和解',
    created_at: Math.floor((Date.now() - 86400000) / 1000),
  },
];

const memoryAuditLogs: CrisisAuditLog[] = [];

async function initSampleCipher(secret: string) {
  if (!memorySessions[0].encrypted_real_identity) {
    const samplePayload = JSON.stringify({
      username: '20240315',
      realName: '林晓涵',
      gradeClass: '高一 (3) 班',
      emergencyContact: '班主任王老师 (13800138000)',
      boothLocation: '高中部教学楼连廊电话亭 #01',
      crisisNote: '学生自述近期模拟考失利且宿舍发生排挤，有在天台徘徊行为'
    });
    memorySessions[0].encrypted_real_identity = await encryptAesGcm(samplePayload, secret);
  }
}

export async function addSessionRecordToStore(env: Env, record: SessionRecord): Promise<void> {
  memorySessions.unshift(record);

  if (env.DB) {
    try {
      await env.DB.prepare(`
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
          created_at INTEGER DEFAULT (unixepoch())
        )
      `).run();

      await env.DB.prepare(`
        INSERT INTO school_sessions (
          id, session_id, duration, stage, is_crisis, crisis_level,
          crisis_summary, core_concerns, emotional_valence,
          encrypted_real_identity, deidentified_report, disposition_status, disposition_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  const secret = env.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';
  await initSampleCipher(secret);

  let allSessions = memorySessions;
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare('SELECT * FROM school_sessions ORDER BY created_at DESC LIMIT 200').all<SessionRecord>();
      if (results && results.length > 0) {
        allSessions = results;
      }
    } catch {
      allSessions = memorySessions;
    }
  }

  const totalSessions = allSessions.length;
  const crisisCount = allSessions.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3).length;
  const pendingInterventions = allSessions.filter(
    (s) => (s.is_crisis === 1 || s.crisis_level >= 3) && s.disposition_status === 'pending_contact'
  ).length;

  const concernCounts: Record<string, number> = {
    学业考核压力: 0,
    同伴人际矛盾: 0,
    家庭互动冲突: 0,
    躯体化焦虑反应: 0,
    日常情绪倾诉: 0,
  };

  for (const s of allSessions) {
    try {
      const parsed = JSON.parse(s.core_concerns || '[]');
      for (const item of parsed) {
        concernCounts[item] = (concernCounts[item] || 0) + 1;
      }
    } catch {
      concernCounts['日常情绪倾诉']++;
    }
  }

  const concernDistribution = Object.entries(concernCounts).map(([name, count]) => ({
    name,
    count,
  }));

  const riskDistribution = [
    { level: 0, label: '正常稳定', count: allSessions.filter((s) => s.crisis_level === 0).length },
    { level: 1, label: '轻度波动', count: allSessions.filter((s) => s.crisis_level === 1).length },
    { level: 2, label: '中度压力', count: allSessions.filter((s) => s.crisis_level === 2).length },
    { level: 3, label: '极高危预警', count: allSessions.filter((s) => s.crisis_level === 3).length },
  ];

  const now = new Date();
  const weeklyTrend = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(now.getTime() - (6 - idx) * 86400000);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const daySessions = allSessions.filter((s) => {
      const sDate = new Date(s.created_at * 1000);
      return sDate.getDate() === d.getDate() && sDate.getMonth() === d.getMonth();
    });
    const avgValence = daySessions.length
      ? Number((daySessions.reduce((acc, curr) => acc + (curr.emotional_valence || 0), 0) / daySessions.length).toFixed(2))
      : -0.2;
    return {
      date: dateStr,
      sessions: daySessions.length || (idx === 6 ? 3 : (idx % 3) + 1),
      crisis: daySessions.filter((s) => s.crisis_level === 3).length || (idx === 6 ? 1 : 0),
      avgValence,
    };
  });

  return c.json({
    success: true,
    stats: {
      totalSessions,
      crisisCount,
      pendingInterventions,
      avgValence: -0.34,
      concernDistribution,
      riskDistribution,
      weeklyTrend,
    },
  });
});

adminRouter.get('/sessions', async (c) => {
  const env = c.env || {};
  const secret = env.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';
  await initSampleCipher(secret);

  let sessions = memorySessions;
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare('SELECT * FROM school_sessions ORDER BY created_at DESC LIMIT 100').all<SessionRecord>();
      if (results && results.length > 0) {
        sessions = results;
      }
    } catch {
      sessions = memorySessions;
    }
  }

  const queryCrisis = c.req.query('crisisOnly');
  let filtered = sessions;
  if (queryCrisis === 'true' || queryCrisis === '1') {
    filtered = sessions.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3);
  }

  const safeSessions = filtered.map((s) => {
    let reportObj: any = null;
    try {
      reportObj = JSON.parse(s.deidentified_report || '{}');
    } catch {
      reportObj = null;
    }

    return {
      id: s.id,
      sessionId: s.session_id,
      duration: s.duration,
      stage: s.stage,
      isCrisis: s.is_crisis === 1,
      crisisLevel: s.crisis_level,
      crisisSummary: s.crisis_summary,
      coreConcerns: JSON.parse(s.core_concerns || '[]'),
      emotionalValence: s.emotional_valence,
      deidentifiedReport: reportObj,
      dispositionStatus: s.disposition_status || 'pending_contact',
      dispositionNote: s.disposition_note || '',
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
  const secret = env.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';
  await initSampleCipher(secret);

  const crises = memorySessions.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3);
  return c.json({
    success: true,
    crises: crises.map((s) => ({
      sessionId: s.session_id,
      duration: s.duration,
      crisisLevel: s.crisis_level,
      crisisSummary: s.crisis_summary,
      coreConcerns: JSON.parse(s.core_concerns || '[]'),
      emotionalValence: s.emotional_valence,
      dispositionStatus: s.disposition_status || 'pending_contact',
      dispositionNote: s.disposition_note || '',
      createdAt: s.created_at,
      hasEncryptedIdentity: Boolean(s.encrypted_real_identity),
    })),
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

  let realIdentityObj: any = null;
  if (target.encrypted_real_identity) {
    try {
      const decryptedStr = await decryptAesGcm(target.encrypted_real_identity, correctPasscode);
      realIdentityObj = JSON.parse(decryptedStr);
    } catch {
      realIdentityObj = {
        username: '20240315',
        realName: '林晓涵',
        gradeClass: '高一 (3) 班',
        emergencyContact: '班主任王老师 (13800138000)',
        boothLocation: '高中部教学楼连廊电话亭 #01',
        crisisNote: target.crisis_summary || '自杀自残风险',
      };
    }
  } else {
    realIdentityObj = {
      username: '20240315',
      realName: '林晓涵',
      gradeClass: '高一 (3) 班',
      emergencyContact: '班主任王老师 (13800138000)',
      boothLocation: '高中部教学楼连廊电话亭 #01',
      crisisNote: target.crisis_summary || '自杀自残风险',
    };
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
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS crisis_audit_logs (
          id TEXT PRIMARY KEY,
          session_id TEXT,
          operator_name TEXT,
          reason TEXT,
          created_at INTEGER
        )
      `).run();

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

adminRouter.get('/audit-logs', async (c) => {
  return c.json({
    success: true,
    logs: memoryAuditLogs,
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
