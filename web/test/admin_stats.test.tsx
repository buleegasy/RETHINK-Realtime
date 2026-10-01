import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AdminApiClient, computeStatsFromLocalSessions } from '../src/lib/api/adminApiClient';
import { useAdminStore } from '../src/store/adminStore';
import { CampusPulseDashboard } from '../src/components/admin/CampusPulseDashboard';
import type { AdminSessionItem, AdminStats } from '../src/types';

function createMockSession(
  partial: Partial<AdminSessionItem> & { sessionId: string },
): AdminSessionItem {
  return {
    id: partial.id || partial.sessionId,
    sessionId: partial.sessionId,
    duration: partial.duration ?? 120,
    stage: partial.stage || 'Active_Listening',
    isCrisis: partial.isCrisis ?? false,
    crisisLevel: partial.crisisLevel ?? 0,
    crisisSummary: partial.crisisSummary || '',
    coreConcerns: partial.coreConcerns || [],
    emotionalValence: partial.emotionalValence ?? 0,
    deidentifiedReport: partial.deidentifiedReport || null,
    dispositionStatus: partial.dispositionStatus || 'pending_contact',
    dispositionNote: partial.dispositionNote || '',
    isDeleted: partial.isDeleted ?? false,
    deletedAt: partial.deletedAt || null,
    deleteReason: partial.deleteReason || null,
    deletedBy: partial.deletedBy || null,
    createdAt: partial.createdAt ?? Date.now(),
    hasEncryptedIdentity: partial.hasEncryptedIdentity ?? false,
  };
}

describe('大盘宏观统计聚合算法与高可用加载状态机 (Dashboard & Stats Engine)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAdminStore.getState().logout();
    vi.restoreAllMocks();
  });

  describe('computeStatsFromLocalSessions 纯函数实证聚合验证', () => {
    it('当传入空数组时，返回合规的真零态 AdminStats 对象（绝不返回 null）', () => {
      const stats = computeStatsFromLocalSessions([]);

      expect(stats).toBeDefined();
      expect(stats.totalSessions).toBe(0);
      expect(stats.crisisCount).toBe(0);
      expect(stats.pendingInterventions).toBe(0);
      expect(stats.avgValence).toBe(0);
      expect(stats.concernDistribution).toEqual([]);
      expect(stats.riskDistribution).toEqual([]);
      expect(stats.weeklyTrend).toEqual([]);
      expect(stats.weeklySummary).toBe('当前暂无倾诉数据，各终端已就绪待命');
    });

    it('严格过滤 mock_ 与 sess_sample_ 伪造数据及已归档软删除记录', () => {
      const mockSessions: AdminSessionItem[] = [
        createMockSession({
          id: '1',
          sessionId: 'mock_session_01',
          coreConcerns: ['虚假数据'],
          emotionalValence: 0.5,
        }),
        createMockSession({
          id: '2',
          sessionId: 'sess_sample_02',
          isCrisis: true,
          crisisLevel: 3,
          coreConcerns: ['假样本'],
          emotionalValence: -0.8,
        }),
        createMockSession({
          id: '3',
          sessionId: 'real_sess_deleted',
          coreConcerns: ['学业焦虑'],
          emotionalValence: -0.2,
          isDeleted: true,
          deletedAt: Date.now(),
          deleteReason: '测试软删除',
          deletedBy: '王老师',
        }),
        createMockSession({
          id: '4',
          sessionId: 'real_sess_active',
          crisisLevel: 1,
          crisisSummary: '轻度焦虑',
          coreConcerns: ['模考压力'],
          emotionalValence: -0.15,
          createdAt: Math.floor(Date.now() / 1000),
        }),
      ];

      const stats = computeStatsFromLocalSessions(mockSessions);
      expect(stats.totalSessions).toBe(1);
      expect(stats.concernDistribution).toEqual([{ name: '模考压力', count: 1 }]);
      expect(stats.riskDistribution).toEqual([
        { level: 0, label: '正常稳定', count: 0 },
        { level: 1, label: '轻度波动', count: 1 },
        { level: 2, label: '中度压力', count: 0 },
        { level: 3, label: '极高危预警', count: 0 },
      ]);
    });

    it('兼容量纲：同时精准支持秒级（10位）与毫秒级（13位）创建时间戳构建 7 天趋势', () => {
      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);

      const sessions: AdminSessionItem[] = [
        createMockSession({
          id: 's1',
          sessionId: 'sess_ms_timestamp',
          coreConcerns: ['人际关系'],
          emotionalValence: 0.4,
          dispositionStatus: 'closed',
          createdAt: nowMs,
        }),
        createMockSession({
          id: 's2',
          sessionId: 'sess_sec_timestamp',
          isCrisis: true,
          crisisLevel: 3,
          crisisSummary: '有冲动倾向',
          coreConcerns: ['人际关系', '家庭矛盾'],
          emotionalValence: -0.6,
          createdAt: nowSec,
          hasEncryptedIdentity: true,
        }),
      ];

      const stats = computeStatsFromLocalSessions(sessions);
      expect(stats.totalSessions).toBe(2);
      expect(stats.crisisCount).toBe(1);
      expect(stats.pendingInterventions).toBe(1);
      // 平均效价：(0.4 + (-0.6)) / 2 = -0.10
      expect(stats.avgValence).toBe(-0.1);
      expect(stats.weeklyTrend).toHaveLength(7);

      // 当天应包含这两次会话
      const todayTrend = stats.weeklyTrend[stats.weeklyTrend.length - 1];
      expect(todayTrend.sessions).toBe(2);
      expect(todayTrend.crisis).toBe(1);
      expect(todayTrend.avgValence).toBe(-0.1);
    });

    it('根据高危危机与核心关切动态生成专业客观的周报小结', () => {
      const crisisSession = createMockSession({
        id: 'c1',
        sessionId: 'sess_crisis_summary',
        isCrisis: true,
        crisisLevel: 3,
        crisisSummary: '高危干预',
        coreConcerns: ['学业重压'],
        emotionalValence: -0.7,
        hasEncryptedIdentity: true,
      });

      const stats = computeStatsFromLocalSessions([crisisSession]);
      expect(stats.weeklySummary).toContain('重点跟进');
      expect(stats.weeklySummary).toContain('学业重压');
    });
  });

  describe('AdminApiClient.fetchStats 高可用防死锁回退逻辑', () => {
    it('当云端接口失败 (401/500/断网) 且本地无数据时，始终返回真零态 AdminStats 而非 null', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network connection refused'));

      const stats = await AdminApiClient.fetchStats();
      expect(stats).toBeDefined();
      expect(stats.totalSessions).toBe(0);
      expect(stats.avgValence).toBe(0);
      expect(stats.weeklyTrend).toEqual([]);
      expect(stats.weeklySummary).toBe('当前暂无倾诉数据，各终端已就绪待命');
    });

    it('当云端接口失败或统计为 0 时，无缝从 localStorage 真实会话中重算宏观指标', async () => {
      const localRealSessions: AdminSessionItem[] = [
        createMockSession({
          id: 'loc_1',
          sessionId: 'sess_offline_01',
          crisisSummary: '日常倾诉',
          coreConcerns: ['同伴交往'],
          emotionalValence: 0.2,
          dispositionStatus: 'closed',
        }),
      ];
      localStorage.setItem('rethink_real_sessions', JSON.stringify(localRealSessions));

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ success: false, error: 'Unauthorized' }),
      });

      const stats = await AdminApiClient.fetchStats();
      expect(stats).toBeDefined();
      expect(stats.totalSessions).toBe(1);
      expect(stats.concernDistribution).toEqual([{ name: '同伴交往', count: 1 }]);
      expect(stats.avgValence).toBe(0.2);
    });

    it('当云端存在统计且有未同步的本地真实会话时，智能合并本地会话并保持 AI 周报', async () => {
      const localRealSessions: AdminSessionItem[] = [
        createMockSession({
          id: 'loc_unsynced',
          sessionId: 'sess_local_unsynced',
          coreConcerns: ['适应不良'],
          emotionalValence: 0.0,
        }),
      ];
      localStorage.setItem('rethink_real_sessions', JSON.stringify(localRealSessions));

      const cloudStats: AdminStats = {
        totalSessions: 1,
        crisisCount: 0,
        pendingInterventions: 0,
        avgValence: 0.5,
        concernDistribution: [{ name: '学业规划', count: 1 }],
        riskDistribution: [
          { level: 0, label: '正常稳定', count: 1 },
          { level: 1, label: '轻度波动', count: 0 },
          { level: 2, label: '中度压力', count: 0 },
          { level: 3, label: '极高危预警', count: 0 },
        ],
        weeklyTrend: [],
        weeklySummary: '来自云端大模型的宏观深度观察简报',
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/admin/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, stats: cloudStats }),
          });
        }
        if (url.includes('/api/admin/sessions')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                sessions: [
                  createMockSession({
                    id: 'cloud_1',
                    sessionId: 'sess_cloud_synced',
                    coreConcerns: ['学业规划'],
                    emotionalValence: 0.5,
                  }),
                ],
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      });

      const stats = await AdminApiClient.fetchStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.weeklySummary).toBe('来自云端大模型的宏观深度观察简报');
    });
  });

  describe('useAdminStore 加载状态机与状态同步', () => {
    it('fetchStats 能够正确更新 isLoadingStats、stats 与 statsError', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/admin/stats')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                stats: {
                  totalSessions: 3,
                  crisisCount: 0,
                  pendingInterventions: 0,
                  avgValence: 0.3,
                  concernDistribution: [],
                  riskDistribution: [],
                  weeklyTrend: [],
                  weeklySummary: '测试小结',
                },
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      });

      const store = useAdminStore.getState();
      expect(store.isLoadingStats).toBe(false);

      const promise = store.fetchStats();
      expect(useAdminStore.getState().isLoadingStats).toBe(true);
      expect(useAdminStore.getState().statsError).toBeNull();

      await promise;
      expect(useAdminStore.getState().isLoadingStats).toBe(false);
      expect(useAdminStore.getState().stats?.totalSessions).toBe(3);
    });
  });

  describe('CampusPulseDashboard 界面视图与防御性容灾渲染', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    it('当 stats.totalSessions === 0 时，渲染真零态冷静就绪提示卡片（零伪造数据合规）', async () => {
      useAdminStore.setState({
        stats: {
          totalSessions: 0,
          crisisCount: 0,
          pendingInterventions: 0,
          avgValence: 0,
          concernDistribution: [],
          riskDistribution: [],
          weeklyTrend: [],
          weeklySummary: '当前暂无倾诉数据，各终端已就绪待命',
        },
        isLoadingStats: false,
      });

      await act(async () => {
        render(<CampusPulseDashboard />);
      });

      expect(screen.getByText('当前暂无倾诉数据，各终端已就绪待命')).toBeInTheDocument();
      expect(
        screen.getByText(/当学生在校园心理终端完成语音倾诉后，系统将自动汇总宏观情绪效价/i),
      ).toBeInTheDocument();
      expect(screen.queryByText('正在加载真实情绪指标...')).not.toBeInTheDocument();
    });

    it('当仅处于 isLoadingStats 且 stats 为空时展示加载状态，不发生白屏', async () => {
      // 保持请求处于 pending 状态，验证加载态视图
      globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
      useAdminStore.setState({
        stats: null,
        isLoadingStats: true,
      });

      render(<CampusPulseDashboard />);
      expect(screen.getByText('正在加载真实情绪指标...')).toBeInTheDocument();
    });

    it('当 stats 中的 weeklyTrend/concernDistribution/riskDistribution 异常缺失时具有防御性回退不崩溃', async () => {
      const defensiveStats: AdminStats = {
        totalSessions: 5,
        crisisCount: 1,
        pendingInterventions: 1,
        avgValence: 0.1,
        concernDistribution: undefined as any,
        riskDistribution: undefined as any,
        weeklyTrend: undefined as any,
        weeklySummary: '防御性测试',
      };
      vi.spyOn(AdminApiClient, 'fetchStats').mockResolvedValue(defensiveStats);
      useAdminStore.setState({
        stats: defensiveStats,
        isLoadingStats: false,
      });

      await act(async () => {
        render(<CampusPulseDashboard />);
      });
      expect(screen.getByText('累计倾诉')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('极高危预警')).toBeInTheDocument();
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    });
  });
});
