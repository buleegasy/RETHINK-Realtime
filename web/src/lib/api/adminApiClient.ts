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
      let stats: AdminStats | null = null;
      if (data.success && data.stats) {
        stats = data.stats;
      }

      // 若远端无 D1 绑定（统计数为 0），自适应合并本地真实会话指标
      try {
        const rawLocal = typeof localStorage !== 'undefined' ? localStorage.getItem('rethink_real_sessions') : null;
        if (rawLocal && stats) {
          const localList: AdminSessionItem[] = JSON.parse(rawLocal);
          if (Array.isArray(localList) && localList.length > 0 && stats.totalSessions === 0) {
            const validLocals = localList.filter(
              (s) => !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_')
            );
            if (validLocals.length > 0) {
              const crisisLocals = validLocals.filter((s) => s.isCrisis || s.crisisLevel >= 3);
              stats.totalSessions = validLocals.length;
              stats.crisisCount = crisisLocals.length;
              stats.pendingInterventions = crisisLocals.filter((s) => s.dispositionStatus === 'pending_contact').length;
              const valences = validLocals.map((s) => s.emotionalValence || 0);
              stats.avgValence = Number((valences.reduce((a, b) => a + b, 0) / valences.length).toFixed(2));
              
              const counts: Record<string, number> = {};
              for (const s of validLocals) {
                for (const c of s.coreConcerns || []) {
                  counts[c] = (counts[c] || 0) + 1;
                }
              }
              stats.concernDistribution = Object.entries(counts).map(([name, count]) => ({ name, count }));
              stats.riskDistribution = [
                { level: 0, label: '正常稳定', count: validLocals.filter((s) => (s.crisisLevel || 0) === 0).length },
                { level: 1, label: '轻度波动', count: validLocals.filter((s) => s.crisisLevel === 1).length },
                { level: 2, label: '中度压力', count: validLocals.filter((s) => s.crisisLevel === 2).length },
                { level: 3, label: '极高危预警', count: validLocals.filter((s) => (s.crisisLevel || 0) >= 3 || s.isCrisis).length },
              ];
            }
          }
        }
      } catch {}

      return stats;
    } catch (err) {
      console.warn('[AdminApiClient] 获取宏观统计数据异常:', err);
      return null;
    }
  }

  public static async fetchCrises(): Promise<AdminCrisisItem[]> {
    try {
      const res = await apiFetch('/api/admin/crises');
      const data = await res.json();
      let list: AdminCrisisItem[] = [];
      if (data.success && Array.isArray(data.crises)) {
        list = data.crises;
      }
      list = list.filter(
        (s) => !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_')
      );

      // 合并本地危机记录
      try {
        const rawLocal = typeof localStorage !== 'undefined' ? localStorage.getItem('rethink_real_sessions') : null;
        if (rawLocal) {
          const localList: AdminSessionItem[] = JSON.parse(rawLocal);
          if (Array.isArray(localList)) {
            for (const loc of localList) {
              if (
                (loc.isCrisis || loc.crisisLevel >= 3) &&
                !loc.sessionId.startsWith('sess_sample_') &&
                !loc.sessionId.startsWith('mock_') &&
                !list.some((c) => c.sessionId === loc.sessionId)
              ) {
                list.push({
                  id: loc.id,
                  sessionId: loc.sessionId,
                  crisisLevel: loc.crisisLevel as any,
                  crisisSummary: loc.crisisSummary,
                  coreConcerns: loc.coreConcerns,
                  createdAt: loc.createdAt,
                  dispositionStatus: loc.dispositionStatus as any,
                  hasEncryptedIdentity: loc.hasEncryptedIdentity,
                });
              }
            }
          }
        }
      } catch {}

      list.sort((a, b) => b.createdAt - a.createdAt);
      return list;
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
      let serverSessions: AdminSessionItem[] = [];
      if (data.success && Array.isArray(data.sessions)) {
        serverSessions = data.sessions;
      }

      // 严禁假数据进入展示层
      serverSessions = serverSessions.filter(
        (s) => !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_')
      );

      // 合并本地真实会话缓存（保证刚完成的本地通话在弱网或冷启动时必定秒级呈现在管理端）
      try {
        const rawLocal = typeof localStorage !== 'undefined' ? localStorage.getItem('rethink_real_sessions') : null;
        if (rawLocal) {
          const localList: AdminSessionItem[] = JSON.parse(rawLocal);
          if (Array.isArray(localList)) {
            for (const loc of localList) {
              if (
                !loc.sessionId.startsWith('sess_sample_') &&
                !loc.sessionId.startsWith('mock_') &&
                !serverSessions.some((s) => s.sessionId === loc.sessionId)
              ) {
                if (!crisisOnly || loc.isCrisis || loc.crisisLevel >= 3) {
                  serverSessions.push(loc);
                }
              }
            }
          }
        }
      } catch {}

      serverSessions.sort((a, b) => b.createdAt - a.createdAt);
      return serverSessions;
    } catch (err) {
      console.warn('[AdminApiClient] 获取个案档案列表异常:', err);
      return [];
    }
  }

  public static async cleanMockData(): Promise<{ success: boolean; purged?: number }> {
    try {
      const res = await apiFetch('/api/admin/clean-mock-data', {
        method: 'POST',
      });
      return await res.json();
    } catch (err) {
      console.warn('[AdminApiClient] 清理假数据异常:', err);
      return { success: false };
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
