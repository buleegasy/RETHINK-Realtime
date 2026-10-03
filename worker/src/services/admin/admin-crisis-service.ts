import type {
  Env,
  CrisisUnmaskPayload,
  DispositionPayload,
  DeleteSessionPayload,
  RestoreSessionPayload,
  WebhookTestPayload,
} from '../../types';
import { SessionRepository } from '../../repositories/session-repository';
import { AuditRepository } from '../../repositories/audit-repository';
import { decryptAesGcm } from '../../lib/crypto-helper';
import { sendCrisisWebhook } from '../../lib/webhook-sender';
import { safeCompare } from './admin-auth-service';

export class AdminCrisisService {
  public static async getCrises(env: Env) {
    const active = await SessionRepository.findActive(env);
    const crises = active.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3);

    return crises.map((s) => {
      let coreConcerns: string[] = [];
      try {
        coreConcerns = JSON.parse(s.core_concerns || '[]');
      } catch (err) {
        console.debug('[AdminCrisisService] 解析 core_concerns 异常:', err);
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
    if (!correctPasscode || !safeCompare(secondary_passcode.trim(), correctPasscode)) {
      await AuditRepository.record(env, {
        session_id,
        operator_name: operator_name?.trim() || '未知操作员',
        reason: '二次安全口令校验失败（异常解除脱敏尝试）',
      }).catch((err) => {
        console.warn('[AdminCrisisService] 审计记录写入失败:', err);
      });

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
      if (env.SESSION_CRYPTO_KEY) {
        try {
          const decryptedStr = await decryptAesGcm(
            target.encrypted_real_identity,
            env.SESSION_CRYPTO_KEY,
          );
          realIdentityObj = JSON.parse(decryptedStr);
        } catch (fallbackErr) {
          console.debug('[AdminCrisisService] SESSION_CRYPTO_KEY 备选解密失败:', fallbackErr);
        }
      }
      if (!realIdentityObj) {
        console.warn('[AdminCrisisService] 身份数据解密异常:', err);
        return { success: false, error: '身份数据解密失败，安全口令或加密密钥不匹配', status: 400 };
      }
    }

    // 针对匿名来访个案（或前端转递报表），规范化补齐身份查验字段
    if (realIdentityObj && !realIdentityObj.username && !realIdentityObj.realName) {
      realIdentityObj = {
        username: '匿名来访',
        realName: '匿名同学',
        gradeClass: '学生来访者',
        emergencyContact: '校园专职心理中心 / 班主任',
        boothLocation: '校园心理驿站#01',
        crisisNote: target.crisis_summary || '匿名进线危机事件',
        ...realIdentityObj,
      };
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
    if (!correctPasscode || !safeCompare(secondary_passcode.trim(), correctPasscode)) {
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
    if (!correctPasscode || !safeCompare(secondary_passcode.trim(), correctPasscode)) {
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

    const res = await sendCrisisWebhook(webhookUrl, testPayload);
    const isSuccess = res.success;
    return {
      success: isSuccess,
      message: isSuccess
        ? '测试危机预警推送成功'
        : res.error || '测试预警发送失败，请检查 Webhook 地址连通性',
      targetUrl: webhookUrl.replace(/(\/bot\/)[^/]+/, '$1***'),
      status: isSuccess ? 200 : 502,
    };
  }
}
