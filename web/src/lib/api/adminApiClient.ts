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

function aggregateValence(sessions: AdminSessionItem[]): number {
  const valences = sessions
    .map((s) => s.emotionalValence)
    .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (valences.length === 0) return 0;
  const sum = valences.reduce((acc, curr) => acc + curr, 0);
  return Number((sum / valences.length).toFixed(2));
}

function aggregateConcerns(sessions: AdminSessionItem[]): Array<{ name: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    for (const c of s.coreConcerns || []) {
      if (typeof c === 'string' && c.trim()) {
        counts[c] = (counts[c] || 0) + 1;
      }
    }
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function aggregateRiskDistribution(
  sessions: AdminSessionItem[],
  crisisCount: number,
): Array<{ level: number; label: string; count: number }> {
  return [
    {
      level: 0,
      label: '正常稳定',
      count: sessions.filter((s) => (s.crisisLevel || 0) === 0 && !s.isCrisis).length,
    },
    {
      level: 1,
      label: '轻度波动',
      count: sessions.filter((s) => s.crisisLevel === 1 && !s.isCrisis).length,
    },
    {
      level: 2,
      label: '中度压力',
      count: sessions.filter((s) => s.crisisLevel === 2 && !s.isCrisis).length,
    },
    { level: 3, label: '极高危预警', count: crisisCount },
  ];
}

function isSameCalendarDay(d1: Date, d2: Date): boolean {
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

function aggregateWeeklyTrend(
  sessions: AdminSessionItem[],
): Array<{ date: string; sessions: number; crisis: number; avgValence: number }> {
  const now = new Date();
  return Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - idx));
    const daySessions = sessions.filter((s) => {
      const ms = (s.createdAt || 0) > 1e11 ? s.createdAt : (s.createdAt || 0) * 1000;
      return isSameCalendarDay(new Date(ms), d);
    });
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      sessions: daySessions.length,
      crisis: daySessions.filter((s) => (s.crisisLevel ?? 0) >= 3 || s.isCrisis).length,
      avgValence: aggregateValence(daySessions),
    };
  });
}

function generateObjectiveSummary(
  concernDistribution: Array<{ name: string; count: number }>,
  crisisCount: number,
): string {
  const topNames = concernDistribution.slice(0, 3).map((c) => c.name);
  const concernStr = topNames.length > 0 ? topNames.join('、') : '日常闲聊与尝试';
  if (crisisCount > 0) {
    return `近期校园监测到个别情绪高压个案，主要涉及${concernStr.slice(0, 12)}等生活事件，建议专职老师重点跟进，常规学生心境整体受控。`;
  }
  if (topNames.length === 0 || concernStr.includes('闲聊') || concernStr.includes('日常')) {
    return '本周学生多以轻量交流与日常寒暄为主，整体心境平和自然，未见群体性学业或情绪焦虑集聚。';
  }
  return `本周来访焦点主要聚焦于${concernStr.slice(0, 12)}，学生在倾诉后情绪多能得到自然舒缓与理清，校园心境总体平稳。`;
}

function buildZeroStats(): AdminStats {
  return {
    totalSessions: 0,
    crisisCount: 0,
    pendingInterventions: 0,
    avgValence: 0,
    concernDistribution: [],
    riskDistribution: [],
    weeklyTrend: [],
    weeklySummary: '当前暂无倾诉数据，各终端已就绪待命',
  };
}

function filterValidSessions(sessions: AdminSessionItem[]): AdminSessionItem[] {
  return (sessions || []).filter(
    (s) =>
      s &&
      !s.isDeleted &&
      !s.sessionId?.startsWith('sess_sample_') &&
      !s.sessionId?.startsWith('mock_'),
  );
}

export function computeStatsFromLocalSessions(sessions: AdminSessionItem[]): AdminStats {
  const valid = filterValidSessions(sessions);
  if (valid.length === 0) return buildZeroStats();

  const crisisLocals = valid.filter((s) => s.isCrisis || (s.crisisLevel ?? 0) >= 3);
  const crisisCount = crisisLocals.length;
  const pendingInterventions = crisisLocals.filter(
    (s) => s.dispositionStatus === 'pending_contact',
  ).length;
  const concernDistribution = aggregateConcerns(valid);

  return {
    totalSessions: valid.length,
    crisisCount,
    pendingInterventions,
    avgValence: aggregateValence(valid),
    concernDistribution,
    riskDistribution: aggregateRiskDistribution(valid, crisisCount),
    weeklyTrend: aggregateWeeklyTrend(valid),
    weeklySummary: generateObjectiveSummary(concernDistribution, crisisCount),
  };
}

function getLocalRealSessions(): AdminSessionItem[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem('rethink_real_sessions');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return filterValidSessions(parsed);
  } catch {
    return [];
  }
}

async function tryFetchCloudStats(): Promise<AdminStats | null> {
  try {
    const res = await apiFetch('/api/admin/stats');
    if (res?.ok) {
      const data = await res.json();
      if (data?.success && data?.stats) {
        return data.stats;
      }
    }
  } catch (err) {
    console.warn('[AdminApiClient] 获取云端宏观统计数据异常:', err);
  }
  return null;
}

async function mergeCloudWithLocal(
  cloudStats: AdminStats,
  localSessions: AdminSessionItem[],
): Promise<AdminStats> {
  if (localSessions.length === 0) return cloudStats;
  try {
    const sessionsRes = await apiFetch('/api/admin/sessions');
    if (sessionsRes?.ok) {
      const sData = await sessionsRes.json();
      if (sData?.success && Array.isArray(sData.sessions) && sData.sessions.length > 0) {
        const serverIds = new Set(sData.sessions.map((s: AdminSessionItem) => s.sessionId));
        const unsynced = localSessions.filter((s) => !serverIds.has(s.sessionId));
        if (unsynced.length > 0) {
          const combined = [...sData.sessions, ...unsynced];
          const merged = computeStatsFromLocalSessions(combined);
          if (
            cloudStats.weeklySummary &&
            cloudStats.weeklySummary !== '当前暂无倾诉数据，各终端已就绪待命' &&
            !cloudStats.weeklySummary.includes('暂无足够的学生来访数据')
          ) {
            merged.weeklySummary = cloudStats.weeklySummary;
          }
          return merged;
        }
      }
    }
  } catch (err) {
    console.warn('[AdminApiClient] 合并本地个案至云端大盘异常:', err);
  }
  return cloudStats;
}

/**
 * 管理后台 API 客户端 (AdminApiClient)
 * 职责：封装与 Worker 管理后端的高可用安全通信（自动附加 Bearer 鉴权凭证）
 */
export class AdminApiClient {
  public static async login(
    username: string,
    password: string,
  ): Promise<{ success: boolean; token?: string; user?: UserProfile; error?: string }> {
    const res = await apiFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  }

  public static async fetchStats(): Promise<AdminStats> {
    const localSessions = getLocalRealSessions();
    const cloudStats = await tryFetchCloudStats();

    if (cloudStats && cloudStats.totalSessions > 0) {
      return mergeCloudWithLocal(cloudStats, localSessions);
    }

    return computeStatsFromLocalSessions(localSessions);
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
        (s) => !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_'),
      );

      // 合并本地真实危机记录
      try {
        const rawLocal =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem('rethink_real_sessions')
            : null;
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
                  sessionId: loc.sessionId,
                  duration: loc.duration,
                  crisisLevel: loc.crisisLevel,
                  crisisSummary: loc.crisisSummary,
                  coreConcerns: loc.coreConcerns,
                  emotionalValence: loc.emotionalValence,
                  dispositionStatus: loc.dispositionStatus,
                  dispositionNote: loc.dispositionNote,
                  createdAt: loc.createdAt,
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

  public static async fetchSessions(
    crisisOnly = false,
    includeDeleted = false,
  ): Promise<AdminSessionItem[]> {
    try {
      const res = await apiFetch(
        `/api/admin/sessions?crisisOnly=${crisisOnly ? 'true' : 'false'}&includeDeleted=${includeDeleted ? 'true' : 'false'}`,
      );
      const data = await res.json();
      let serverSessions: AdminSessionItem[] = [];
      if (data.success && Array.isArray(data.sessions)) {
        serverSessions = data.sessions;
      }

      // 严禁假数据进入展示层，真实反映服务端记录
      serverSessions = serverSessions.filter(
        (s) => !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_'),
      );

      // 合并本地真实通话建档记录（确保刚在终端完成的倾诉在离线或冷启动时也能秒级呈现在档案库中）
      try {
        const rawLocal =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem('rethink_real_sessions')
            : null;
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
    operatorName: string,
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
    note?: string,
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
    operatorName: string,
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
    operatorName: string,
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
    transcript?: string,
  ): Promise<{ success: boolean; report?: any; session?: any; error?: string }> {
    const res = await apiFetch('/api/admin/sessions/re-evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, transcript }),
    });
    return res.json();
  }
}
