import type {
  AdminStats,
  AdminCrisisItem,
  AdminSessionItem,
  UnmaskedIdentity,
  CrisisAuditLog,
  DispositionStatus,
  UserProfile,
} from '../../types';
import { apiFetch } from '../api';

/**
 * 管理后台 API 客户端 (AdminApiClient)
 * 职责：封装与 Worker 管理后端的高可用安全通信（自动附加 Bearer 鉴权凭证）
 */
export class AdminApiClient {
  public static async login(
    username: string,
    password: string
  ): Promise<{ success: boolean; token?: string; user?: UserProfile; error?: string }> {
    const res = await apiFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  }

  public static async fetchStats(): Promise<AdminStats | null> {
    try {
      const res = await apiFetch('/api/admin/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        return data.stats;
      }
      return null;
    } catch (err) {
      console.warn('[AdminApiClient] 获取宏观统计数据异常:', err);
      return null;
    }
  }

  public static async fetchCrises(): Promise<AdminCrisisItem[]> {
    try {
      const res = await apiFetch('/api/admin/crises');
      const data = await res.json();
      if (data.success && Array.isArray(data.crises)) {
        return data.crises;
      }
      return [];
    } catch (err) {
      console.warn('[AdminApiClient] 获取危机事件列表异常:', err);
      return [];
    }
  }

  public static async fetchSessions(crisisOnly = false, includeDeleted = false): Promise<AdminSessionItem[]> {
    try {
      const res = await apiFetch(
        `/api/admin/sessions?crisisOnly=${crisisOnly ? 'true' : 'false'}&includeDeleted=${includeDeleted ? 'true' : 'false'}`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.sessions)) {
        return data.sessions;
      }
      return [];
    } catch (err) {
      console.warn('[AdminApiClient] 获取个案档案列表异常:', err);
      return [];
    }
  }

  public static async fetchAuditLogs(): Promise<CrisisAuditLog[]> {
    try {
      const res = await apiFetch('/api/admin/audit-logs');
      const data = await res.json();
      return data.success && Array.isArray(data.logs) ? data.logs : [];
    } catch (err) {
      console.warn('[AdminApiClient] 获取审计日志异常:', err);
      return [];
    }
  }

  public static async unmaskCrisis(
    sessionId: string,
    passcode: string,
    operatorName: string
  ): Promise<{ success: boolean; realIdentity?: UnmaskedIdentity; error?: string }> {
    const res = await apiFetch('/api/admin/crisis/unmask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        secondary_passcode: passcode,
        operator_name: operatorName,
      }),
    });
    return res.json();
  }

  public static async updateDisposition(
    sessionId: string,
    status: DispositionStatus,
    note?: string
  ): Promise<boolean> {
    try {
      const res = await apiFetch('/api/admin/crisis/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          status,
          note: note || '',
        }),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.warn('[AdminApiClient] 更新处置状态异常:', err);
      return false;
    }
  }

  public static async deleteSession(
    sessionId: string,
    passcode: string,
    reason: string,
    operatorName: string
  ): Promise<{ success: boolean; error?: string }> {
    const res = await apiFetch('/api/admin/sessions/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        secondary_passcode: passcode,
        reason,
        operator_name: operatorName,
      }),
    });
    return res.json();
  }

  public static async restoreSession(
    sessionId: string,
    passcode: string,
    operatorName: string
  ): Promise<{ success: boolean; error?: string }> {
    const res = await apiFetch('/api/admin/sessions/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        secondary_passcode: passcode,
        operator_name: operatorName,
      }),
    });
    return res.json();
  }

  public static async reEvaluateSession(
    sessionId: string,
    transcript?: string
  ): Promise<{ success: boolean; report?: any; session?: any; error?: string }> {
    const res = await apiFetch('/api/admin/sessions/re-evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, transcript }),
    });
    return res.json();
  }
}
