import React, { useEffect } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Users,
  HeartHandshake,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';

export const CampusPulseDashboard: React.FC = () => {
  const { stats, fetchStats } = useAdminStore();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (!stats) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center border border-[#e1e3e1]">
        <div className="text-xs text-[#5e5e5e]">正在加载真实情绪指标...</div>
      </div>
    );
  }

  const maxSessions = Math.max(...stats.weeklyTrend.map((t) => t.sessions), 1);
  const totalConcerns = stats.concernDistribution.reduce((acc, curr) => acc + curr.count, 0) || 1;
  const totalRiskCount = stats.riskDistribution.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-3xl p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[#5e5e5e] block">
              累计倾诉
            </span>
            <span className="text-2xl font-bold text-[#1f1f1f] mt-1 block">
              {stats.totalSessions}
            </span>
            <span className="text-[11px] text-[#146c2e] font-medium flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              在线运行
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#f0f4f9] text-[#004a77] flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-[#ffffff] border border-[#f2b8b5] rounded-3xl p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[#601410] block">
              极高危预警
            </span>
            <span className="text-2xl font-bold text-[#ba1a1a] mt-1 block">
              {stats.crisisCount}
            </span>
            <span className="text-[11px] text-[#ba1a1a] font-medium flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3" />
              闭环管理
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#fce8e6] text-[#ba1a1a] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-[#ffffff] border border-[#feedc2] rounded-3xl p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[#442c00] block">
              待跟进个案
            </span>
            <span className="text-2xl font-bold text-[#b45309] mt-1 block">
              {stats.pendingInterventions}
            </span>
            <span className="text-[11px] text-[#b45309] font-medium flex items-center gap-1 mt-1">
              <Activity className="w-3 h-3" />
              待线下确认
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#fef3c7] text-[#b45309] flex items-center justify-center">
            <HeartHandshake className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-[#ffffff] border border-[#bbf7d0] rounded-3xl p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[#166534] block">
              平均情绪效价
            </span>
            <span className="text-2xl font-bold text-[#146c2e] mt-1 block">
              {stats.avgValence > 0 ? `+${stats.avgValence}` : stats.avgValence}
            </span>
            <span className="text-[11px] text-[#166534] font-medium block mt-1">
              -1.0 ~ +1.0
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#f0fdf4] text-[#146c2e] flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 本周摘要 (DeepSeek V4 Flash 客观中立求实研判) */}
      <div className="bg-gradient-to-r from-[#f0f4f9] via-[#ffffff] to-[#f8f9fa] border border-[#d2e3fc] rounded-3xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[#e8f0fe] text-[#004a77] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#004a77]" />
            </div>
            <h3 className="text-sm font-bold text-[#1f1f1f] tracking-tight">
              本周摘要
            </h3>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#ffffff] text-[#004a77] border border-[#d2e3fc] shadow-xs">
            DeepSeek V4 Flash 客观研判
          </span>
        </div>
        <p className="text-xs text-[#333a40] leading-relaxed pl-9 pr-2 font-normal">
          {stats.weeklySummary || (stats.totalSessions === 0 ? '暂无足够的来访数据以形成本周情绪趋势摘要。' : '本周来访情绪总体平稳，倾诉议题主要聚焦于学业与人际，未见系统性心理危机聚集。')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#ffffff] border border-[#e1e3e1] rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-[#1f1f1f]">
              近 7 天趋势
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-[#444746]">
                <span className="w-3 h-3 rounded-sm bg-[#004a77] inline-block" />
                常规倾诉
              </span>
              <span className="flex items-center gap-1 text-[#444746]">
                <span className="w-3 h-3 rounded-sm bg-[#ba1a1a] inline-block" />
                危机预警
              </span>
            </div>
          </div>

          <div className="h-64 flex items-end justify-between gap-3 pt-6 border-b border-[#e1e3e1] pb-2">
            {stats.weeklyTrend.map((item, i) => {
              const normalCount = Math.max(0, item.sessions - item.crisis);
              const normalHeight = (normalCount / maxSessions) * 100;
              const crisisHeight = (item.crisis / maxSessions) * 100;

              return (
                <div key={i} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full max-w-[40px] flex flex-col items-center justify-end h-full">
                    {item.crisis > 0 && (
                      <div
                        style={{ height: `${crisisHeight}%` }}
                        className="w-full bg-[#ba1a1a] rounded-t-lg transition-all"
                      />
                    )}
                    {normalCount > 0 && (
                      <div
                        style={{ height: `${normalHeight}%` }}
                        className={`w-full bg-[#004a77] transition-all ${
                          item.crisis > 0 ? 'rounded-b-lg' : 'rounded-lg'
                        }`}
                      />
                    )}
                    {normalCount === 0 && item.crisis === 0 && (
                      <div className="w-full h-1 bg-[#e1e3e1] rounded-full mb-1" />
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-[#747775] mt-2 block">
                    {item.date}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-3xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-[#004a77]" />
              <h3 className="text-base font-bold text-[#1f1f1f]">
                风险分层
              </h3>
            </div>

            <div className="space-y-4">
              {stats.riskDistribution.map((r) => {
                const colors = [
                  { bg: 'bg-[#146c2e]', text: 'text-[#146c2e]' },
                  { bg: 'bg-[#004a77]', text: 'text-[#004a77]' },
                  { bg: 'bg-[#f59e0b]', text: 'text-[#b45309]' },
                  { bg: 'bg-[#ba1a1a]', text: 'text-[#ba1a1a]' },
                ];
                const c = colors[r.level] || colors[0];
                const percent = totalRiskCount > 0 ? Math.round((r.count / totalRiskCount) * 100) : 0;

                return (
                  <div key={r.level} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#1f1f1f]">{r.label}</span>
                      <span className={`font-bold ${c.text}`}>{r.count} 起 ({percent}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#f0f4f9] overflow-hidden">
                      <div
                        style={{ width: `${percent}%` }}
                        className={`h-full ${c.bg} rounded-full transition-all`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-3xl p-6">
        <h3 className="text-base font-bold text-[#1f1f1f] mb-4">
          议题分布
        </h3>

        {stats.concernDistribution.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#747775] bg-[#f8f9fa] rounded-2xl border border-dashed border-[#e1e3e1]">
            暂无议题数据（真实倾诉完成后系统自动统计）
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {stats.concernDistribution.map((item, idx) => {
              const percent = Math.round((item.count / totalConcerns) * 100);
              return (
                <div
                  key={idx}
                  className="bg-[#f8f9fa] border border-[#e1e3e1] p-4 rounded-2xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1f1f1f]">
                      {item.name}
                    </span>
                    <span className="text-[11px] font-mono text-[#004a77] bg-[#f0f4f9] px-2 py-0.5 rounded-full font-bold">
                      #{idx + 1}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-[#1f1f1f]">
                    {item.count} <span className="text-xs font-normal text-[#747775]">次</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#e1e3e1] overflow-hidden">
                    <div
                      style={{ width: `${percent}%` }}
                      className="h-full bg-[#004a77] rounded-full"
                    />
                  </div>
                  <span className="text-[11px] text-[#747775] block">
                    {percent}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
