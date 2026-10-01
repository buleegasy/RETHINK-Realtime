import type {
  Env,
  CrisisUnmaskPayload,
  DispositionPayload,
  DeleteSessionPayload,
  RestoreSessionPayload,
  WebhookTestPayload,
} from '../types';
import { SessionRepository } from '../repositories/session-repository';
import { AuditRepository } from '../repositories/audit-repository';
import { decryptAesGcm } from '../lib/crypto-helper';
import { sendCrisisWebhook } from '../lib/webhook-sender';
import {
  generateWeeklySummaryDeepSeekV4Flash,
  generateStructuredReportWithFlash,
} from '../lib/deepseek-flash';
import { signAuthToken, verifyPassword, resolveJwtSecret } from '../lib/auth-crypto';

export class AdminService {
  public static async authenticateTeacher(username?: string, password?: string, env?: Env) {
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return { success: false, error: '请输入有效的教师账号与密码', status: 400 };
    }

    const cleanUser = username.trim();
    if (cleanUser.length < 2) {
      return { success: false, error: '账号格式不正确', status: 400 };
    }

    const isProduction = env?.ENVIRONMENT === 'production';
    const teacherCredential = env?.TEACHER_PASSWORD;
    let isPasswordValid = false;

    if (env?.DB) {
      try {
        const row = await env.DB.prepare('SELECT password_hash FROM users WHERE username = ?')
          .bind(cleanUser)
          .first<{ password_hash?: string }>();

        if (row?.password_hash) {
          isPasswordValid = await verifyPassword(password, row.password_hash);
        }
      } catch (err) {
        console.warn('[AdminAuth] D1 教师用户查询异常:', err);
      }
    }

    // 若配置了 TEACHER_PASSWORD 环境变量，支持环境变量覆盖鉴权
    if (!isPasswordValid && teacherCredential) {
      if (teacherCredential.startsWith('pbkdf2:')) {
        isPasswordValid = await verifyPassword(password, teacherCredential);
      } else {
        isPasswordValid = password === teacherCredential;
      }
    }

    // 仅在非生产/单元测试调试环境下允许使用临时默认凭证；生产环境严格阻断已知弱口令
    if (!isPasswordValid && !teacherCredential && !isProduction) {
      const devDefault = atob('Y291bnNlbG9yMjAyNg==');
      if (password === devDefault) {
        isPasswordValid = true;
      }
    }

    if (!isPasswordValid) {
      return { success: false, error: '教师账号或密码错误', status: 401 };
    }

    const currentEpoch = Math.floor(Date.now() / 1000);
    let secretKey = '';
    try {
      secretKey = resolveJwtSecret(env);
    } catch (err: any) {
      return { success: false, error: err?.message || '鉴权服务配置异常', status: 500 };
    }

    const token = await signAuthToken(
      {
        uid: `teacher_${cleanUser}`,
        username: cleanUser,
        displayName: cleanUser === 'teacher' ? '校心理专职教师' : `${cleanUser}老师`,
        role: 'teacher',
        iat: currentEpoch,
        exp: currentEpoch + 86400, // 教师凭证 24 小时有效
      },
      secretKey,
    );

    const user = {
      uid: `teacher_${cleanUser}`,
      username: cleanUser,
      displayName: cleanUser === 'teacher' ? '校心理专职教师' : `${cleanUser}老师`,
      role: 'teacher',
      permissions: ['view_macro_pulse', 'view_deidentified_reports', 'crisis_audit_unmask'],
      isAuthenticated: true,
    };

    return {
      success: true,
      token,
      user,
      status: 200,
    };
  }

  public static async getMacroStats(env: Env) {
    const allSessions = await SessionRepository.findActive(env);

    const totalSessions = allSessions.length;
    const crisisCount = allSessions.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3).length;
    const pendingInterventions = allSessions.filter(
      (s) =>
        (s.is_crisis === 1 || s.crisis_level >= 3) && s.disposition_status === 'pending_contact',
    ).length;

    const validValences = allSessions
      .map((s) => s.emotional_valence)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const avgValence =
      validValences.length > 0
        ? Number(
            (validValences.reduce((acc, curr) => acc + curr, 0) / validValences.length).toFixed(2),
          )
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
      {
        level: 0,
        label: '正常稳定',
        count: allSessions.filter((s) => (s.crisis_level || 0) === 0).length,
      },
      {
        level: 1,
        label: '轻度波动',
        count: allSessions.filter((s) => s.crisis_level === 1).length,
      },
      {
        level: 2,
        label: '中度压力',
        count: allSessions.filter((s) => s.crisis_level === 2).length,
      },
      {
        level: 3,
        label: '极高危预警',
        count: allSessions.filter((s) => (s.crisis_level || 0) >= 3 || s.is_crisis === 1).length,
      },
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
        .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
      const dayAvgValence =
        dayValences.length > 0
          ? Number(
              (dayValences.reduce((acc, curr) => acc + curr, 0) / dayValences.length).toFixed(2),
            )
          : 0.0;

      return {
        date: dateStr,
        sessions: daySessions.length,
        crisis: daySessions.filter((s) => s.crisis_level === 3 || s.is_crisis === 1).length,
        avgValence: dayAvgValence,
      };
    });

    let weeklySummary = '当前暂无足够的学生来访数据，各咨询终端正常就绪待命。';
    try {
      weeklySummary = await generateWeeklySummaryDeepSeekV4Flash(
        {
          totalSessions,
          crisisCount,
          avgValence,
          topConcerns: concernDistribution.slice(0, 3),
        },
        {
          apiKey: env.OPENROUTER_API_KEY,
          baseUrl: env.OPENROUTER_BASE_URL,
          model: env.OPENROUTER_MODEL,
          signal: AbortSignal.timeout(3000),
        },
      );
    } catch (err) {
      console.warn('[AdminService] 宏观周报提炼超时或异常:', err);
    }

    return {
      totalSessions,
      crisisCount,
      pendingInterventions,
      avgValence,
      concernDistribution,
      riskDistribution,
      weeklyTrend,
      weeklySummary,
    };
  }

  public static async getSessions(
    env: Env,
    options?: { includeDeleted?: boolean; crisisOnly?: boolean },
  ) {
    const rawSessions = options?.includeDeleted
      ? await SessionRepository.findArchived(env).then(async (arch) => {
          const act = await SessionRepository.findActive(env);
          return [...act, ...arch].sort((a, b) => b.created_at - a.created_at);
        })
      : await SessionRepository.findActive(env);

    let filtered = rawSessions;
    if (options?.crisisOnly) {
      filtered = filtered.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3);
    }

    return filtered.map((s) => {
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
  }

  public static async getCrises(env: Env) {
    const active = await SessionRepository.findActive(env);
    const crises = active.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3);

    return crises.map((s) => {
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
    });
  }

  public static async unmaskCrisis(env: Env, body: CrisisUnmaskPayload) {
    const { session_id, secondary_passcode, operator_name } = body;
    if (!session_id || !secondary_passcode) {
      return { success: false, error: '缺少会话标识或二次安全口令', status: 400 };
    }

    const isProduction = env.ENVIRONMENT === 'production';
    const correctPasscode =
      env.TEACHER_SECONDARY_PASSCODE || (!isProduction ? 'teacher-safe-2026' : '');
    if (!correctPasscode || secondary_passcode.trim() !== correctPasscode) {
      return {
        success: false,
        error: '二次安全口令错误。为保护学生隐私，系统已拒绝解除脱敏并记录本次异常操作。',
        status: 403,
      };
    }

    const target = await SessionRepository.findBySessionId(env, session_id);
    if (!target) {
      return { success: false, error: '未找到该危机事件记录', status: 404 };
    }

    if (!target.encrypted_real_identity) {
      return { success: false, error: '该危机记录未包含加密学生身份数据，无法解密', status: 400 };
    }

    let realIdentityObj: any = null;
    try {
      const decryptedStr = await decryptAesGcm(target.encrypted_real_identity, correctPasscode);
      realIdentityObj = JSON.parse(decryptedStr);
    } catch (err) {
      console.warn('[AdminService] 身份数据解密异常:', err);
      return { success: false, error: '身份数据解密失败，安全口令或加密密钥不匹配', status: 500 };
    }

    const auditLog = await AuditRepository.record(env, {
      session_id,
      operator_name: operator_name?.trim() || '心理专职教师',
      reason: '自杀/自残危机紧急线下干预穿透查看',
    });

    return {
      success: true,
      session_id,
      realIdentity: realIdentityObj,
      auditLog,
      status: 200,
    };
  }

  public static async updateDisposition(env: Env, body: DispositionPayload) {
    const { session_id, status, note } = body;
    if (!session_id || !status) {
      return { success: false, error: '缺少会话标识或处置状态', status: 400 };
    }

    await SessionRepository.updateDisposition(env, session_id, status, note);
    return {
      success: true,
      session_id,
      status,
      note: note || '',
      httpStatus: 200,
    };
  }

  public static async softDelete(env: Env, body: DeleteSessionPayload) {
    const { session_id, secondary_passcode, reason, operator_name } = body;
    if (!session_id || !secondary_passcode || !reason) {
      return { success: false, error: '缺少会话标识、归档口令或归档事由', status: 400 };
    }

    const isProduction = env.ENVIRONMENT === 'production';
    const correctPasscode =
      env.TEACHER_SECONDARY_PASSCODE || (!isProduction ? 'teacher-safe-2026' : '');
    if (!correctPasscode || secondary_passcode.trim() !== correctPasscode) {
      return { success: false, error: '二次口令校验失败，无权归档个案记录', status: 403 };
    }

    if (reason.trim().length < 4) {
      return {
        success: false,
        error: '归档事由描述不足，请详尽记录归档原因（至少4字）',
        status: 400,
      };
    }

    const operator = operator_name?.trim() || '心理专职教师';
    const success = await SessionRepository.softDelete(env, session_id, reason.trim(), operator);
    if (!success) {
      return { success: false, error: '未找到待归档的会话记录', status: 404 };
    }

    const auditLog = await AuditRepository.record(
      env,
      {
        session_id,
        operator_name: operator,
        reason: `个案归档软删除: ${reason.trim()}`,
      },
      'delete_audit',
    );

    return {
      success: true,
      session_id,
      isDeleted: true,
      auditLog,
      status: 200,
    };
  }

  public static async restoreSession(env: Env, body: RestoreSessionPayload) {
    const { session_id, secondary_passcode, operator_name } = body;
    if (!session_id || !secondary_passcode) {
      return { success: false, error: '缺少会话标识或恢复口令', status: 400 };
    }

    const isProduction = env.ENVIRONMENT === 'production';
    const correctPasscode =
      env.TEACHER_SECONDARY_PASSCODE || (!isProduction ? 'teacher-safe-2026' : '');
    if (!correctPasscode || secondary_passcode.trim() !== correctPasscode) {
      return { success: false, error: '二次口令校验失败，无权恢复已归档个案', status: 403 };
    }

    const success = await SessionRepository.restore(env, session_id);
    if (!success) {
      return { success: false, error: '未找到对应的归档记录', status: 404 };
    }

    const operator = operator_name?.trim() || '心理专职教师';
    const auditLog = await AuditRepository.record(
      env,
      {
        session_id,
        operator_name: operator,
        reason: '已归档个案重新激活恢复至大盘',
      },
      'restore_audit',
    );

    return {
      success: true,
      session_id,
      isDeleted: false,
      auditLog,
      status: 200,
    };
  }

  public static async reEvaluateSession(env: Env, sessionId: string, overrideTranscript?: string) {
    if (!sessionId) {
      return { success: false, error: '缺少会话标识', status: 400 };
    }

    const target = await SessionRepository.findBySessionId(env, sessionId);
    if (!target) {
      return { success: false, error: '未找到该个案记录', status: 404 };
    }

    let existingReport: any = {};
    try {
      existingReport = JSON.parse(target.deidentified_report || '{}');
    } catch {}

    const transcript =
      overrideTranscript ||
      existingReport.deidentifiedTranscript ||
      existingReport.transcript ||
      '';
    if (!transcript) {
      return { success: false, error: '个案对话记录为空，无法重算评估简报', status: 400 };
    }

    const newReport = await generateStructuredReportWithFlash(transcript, {
      apiKey: env.OPENROUTER_API_KEY,
      baseUrl: env.OPENROUTER_BASE_URL,
      model: env.OPENROUTER_MODEL,
    });

    const mergedReport = {
      ...existingReport,
      cbtStageReached: newReport.isCrisis ? 'Crisis_Escalation' : 'Socratic_Questioning',
      coreConcerns: newReport.coreConcerns,
      cognitiveDistortions: newReport.cognitiveDistortions,
      emotionalTrajectory: {
        initial:
          newReport.initialEmotion || existingReport.emotionalTrajectory?.initial || '情绪低落',
        final:
          newReport.finalEmotion ||
          existingReport.emotionalTrajectory?.final ||
          '事实与情绪逐步分离',
        deltaNotes: newReport.deltaNotes || newReport.crisisSummary,
      },
      keyTakeaways: newReport.keyTakeaways,
      homeworkAction: newReport.homeworkAction,
      actionItems: newReport.actionItems,
      evaluatedBy: 'DeepSeek V4 Flash',
      reEvaluatedAt: Date.now(),
    };

    const reportJson = JSON.stringify(mergedReport);
    await SessionRepository.updateReport(env, sessionId, {
      deidentifiedReport: reportJson,
      stage: mergedReport.cbtStageReached,
      isCrisis: newReport.isCrisis ? 1 : 0,
      crisisLevel: newReport.crisisLevel,
      crisisSummary: newReport.crisisSummary,
      coreConcerns: JSON.stringify(newReport.coreConcerns),
      emotionalValence: newReport.emotionalValence,
    });

    return {
      success: true,
      session_id: sessionId,
      report: mergedReport,
      updatedReport: mergedReport,
      status: 200,
    };
  }

  public static async getAuditLogs(env: Env) {
    return AuditRepository.findAll(env);
  }

  public static async testWebhook(env: Env, body: WebhookTestPayload) {
    const webhookUrl = body.webhookUrl || env.CRISIS_WEBHOOK_URL;
    if (!webhookUrl) {
      return { success: false, error: '未配置 CRISIS_WEBHOOK_URL，无法发送告警测试', status: 400 };
    }

    const testPayload = {
      sessionId: `test_${Date.now()}`,
      crisisLevel: (body.crisisLevel ?? 3) as any,
      crisisSummary: '【自动化通道巡检】校园心理终端紧急预警链路联通性测试',
      occurredAt: new Date().toISOString(),
      boothLocation: '校园心理驿站#01 (测试终端)',
      coreConcerns: ['系统通道测试', '告警联通性验证'],
    };

    const sent = await sendCrisisWebhook(webhookUrl, testPayload);
    return {
      success: sent,
      message: sent ? '测试危机预警推送成功' : '测试预警发送失败，请检查 Webhook 地址连通性',
      targetUrl: webhookUrl.replace(/(\/bot\/)[^/]+/, '$1***'),
      status: sent ? 200 : 502,
    };
  }
}
