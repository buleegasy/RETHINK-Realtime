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

const RISK_LEVEL_COLORS = [
  { bg: 'bg-[#146c2e]', text: 'text-[#146c2e]' },
  { bg: 'bg-[#004a77]', text: 'text-[#004a77]' },
  { bg: 'bg-[#f59e0b]', text: 'text-[#b45309]' },
  { bg: 'bg-[#ba1a1a]', text: 'text-[#ba1a1a]' },
];

export const CampusPulseDashboard: React.FC = () => {
  const { stats, isLoadingStats, fetchStats, setActiveTab } = useAdminStore();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoadingStats && !stats) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center border border-[#e1e3e1]">
        <div className="text-xs text-[#5e5e5e]">正在加载真实情绪指标...</div>
      </div>
    );
  }

  if (!stats || stats.totalSessions === 0) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center border border-[#e1e3e1] space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#f0f4f9] text-[#004a77] flex items-center justify-center">
          <Activity className="w-7 h-7 text-[#004a77]" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[#1f1f1f]">当前暂无倾诉数据，各终端已就绪待命</h3>
          <p className="text-xs text-[#5e5e5e] max-w-md mx-auto">
            当学生在校园心理终端完成语音倾诉后，系统将自动汇总宏观情绪效价、议题聚类与风险分层趋势。
          </p>
        </div>
      </div>
    );
  }

  const maxSessions = Math.max(...(stats.weeklyTrend || []).map((t) => t.sessions), 1);
  const totalConcerns =
    (stats.concernDistribution || []).reduce((acc, curr) => acc + curr.count, 0) || 1;
  const totalRiskCount = (stats.riskDistribution || []).reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          className="text-left bg-[#ffffff] border border-[#e1e3e1] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 cursor-pointer hover:border-[#004a77] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#004a77]"
        >
          <div>
            <span className="text-[11px] sm:text-xs font-medium text-[#5e5e5e] block">
              累计倾诉
            </span>
            <span className="text-xl sm:text-2xl font-bold text-[#1f1f1f] mt-0.5 sm:mt-1 block">
              {stats.totalSessions}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#146c2e] font-medium flex items-center gap-1 mt-1 truncate">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">在线运行 · </span>点击查阅个案
            </span>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#f0f4f9] text-[#004a77] flex items-center justify-center shrink-0 self-end sm:self-auto">
            <Users className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('crises')}
          className="text-left bg-[#ffffff] border border-[#f2b8b5] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 cursor-pointer hover:border-[#ba1a1a] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#ba1a1a]"
        >
          <div>
            <span className="text-[11px] sm:text-xs font-medium text-[#601410] block">
              极高危预警
            </span>
            <span className="text-xl sm:text-2xl font-bold text-[#ba1a1a] mt-0.5 sm:mt-1 block">
              {stats.crisisCount}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#ba1a1a] font-medium flex items-center gap-1 mt-1 truncate">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">闭环管理 · </span>点击转介
            </span>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#fce8e6] text-[#ba1a1a] flex items-center justify-center shrink-0 self-end sm:self-auto">
            <AlertTriangle className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('crises')}
          className="text-left bg-[#ffffff] border border-[#feedc2] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 cursor-pointer hover:border-[#b45309] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#b45309]"
        >
          <div>
            <span className="text-[11px] sm:text-xs font-medium text-[#442c00] block">
              待跟进个案
            </span>
            <span className="text-xl sm:text-2xl font-bold text-[#b45309] mt-0.5 sm:mt-1 block">
              {stats.pendingInterventions}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#b45309] font-medium flex items-center gap-1 mt-1 truncate">
              <Activity className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">待线下确认 · </span>点击处置
            </span>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#fef3c7] text-[#b45309] flex items-center justify-center shrink-0 self-end sm:self-auto">
            <HeartHandshake className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </button>

        <div className="bg-[#ffffff] border border-[#bbf7d0] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
          <div>
            <span className="text-[11px] sm:text-xs font-medium text-[#166534] block">
              平均情绪效价
            </span>
            <span className="text-xl sm:text-2xl font-bold text-[#146c2e] mt-0.5 sm:mt-1 block">
              {(stats.avgValence ?? 0) > 0 ? `+${stats.avgValence}` : (stats.avgValence ?? 0)}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#166534] font-medium block mt-1 truncate">
              -1.0 ~ +1.0
            </span>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#f0fdf4] text-[#146c2e] flex items-center justify-center shrink-0 self-end sm:self-auto">
            <Activity className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* 本周小结 (AI生成) */}
      <div className="bg-gradient-to-r from-[#f0f4f9] via-[#ffffff] to-[#f8f9fa] border border-[#d2e3fc] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between gap-3 mb-2 sm:mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-[#e8f0fe] text-[#004a77] flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#004a77]" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-[#1f1f1f] tracking-tight">本周小结</h3>
          </div>
          <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] text-[#5e5e5e] bg-[#ffffff] border border-[#d2e3fc] shadow-2xs font-medium">
            AI生成
          </span>
        </div>
        <p className="text-xs text-[#333a40] leading-relaxed pl-0 sm:pl-9 mt-1 sm:mt-0 font-normal">
          {stats.weeklySummary ||
            (stats.totalSessions === 0
              ? '当前暂无足够的学生来访数据，各咨询终端正常就绪待命。'
              : '本周学生多以轻量交流与日常寒暄为主，整体心境平和自然，未见群体性学业或情绪焦虑集聚。')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 bg-[#ffffff] border border-[#e1e3e1] rounded-2xl sm:rounded-3xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-4 sm:mb-6">
            <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f]">近 7 天趋势</h3>
            <div className="flex items-center gap-3 text-[11px] sm:text-xs">
              <span className="flex items-center gap-1 text-[#444746]">
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-[#004a77] inline-block" />
                常规倾诉
              </span>
              <span className="flex items-center gap-1 text-[#444746]">
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-[#ba1a1a] inline-block" />
                危机预警
              </span>
            </div>
          </div>

          <div className="h-52 sm:h-64 flex items-end justify-between gap-1.5 sm:gap-3 pt-4 sm:pt-6 border-b border-[#e1e3e1] pb-2 overflow-x-auto min-w-0">
            {(stats.weeklyTrend || []).map((item, i) => {
              const normalCount = Math.max(0, item.sessions - item.crisis);
              const normalHeight = (normalCount / maxSessions) * 100;
              const crisisHeight = (item.crisis / maxSessions) * 100;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center h-full justify-end group min-w-[28px]"
                >
                  <div className="w-full max-w-[32px] sm:max-w-[40px] flex flex-col items-center justify-end h-full">
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
                  <span className="text-[10px] sm:text-[11px] font-medium text-[#747775] mt-2 block truncate">
                    {item.date}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Layers className="w-4 h-4 text-[#004a77]" />
              <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f]">风险分层</h3>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {(stats.riskDistribution || []).map((r) => {
                const c = RISK_LEVEL_COLORS[r.level] || RISK_LEVEL_COLORS[0];
                const percent =
                  totalRiskCount > 0 ? Math.round((r.count / totalRiskCount) * 100) : 0;

                return (
                  <div key={r.level} className="space-y-1 sm:space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#1f1f1f]">{r.label}</span>
                      <span className={`font-bold ${c.text}`}>
                        {r.count} 起 ({percent}%)
                      </span>
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

      <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-2xl sm:rounded-3xl p-4 sm:p-6">
        <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f] mb-3 sm:mb-4">议题分布</h3>

        {(stats.concernDistribution || []).length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-xs text-[#747775] bg-[#f8f9fa] rounded-2xl border border-dashed border-[#e1e3e1]">
            暂无议题数据（真实倾诉完成后系统自动统计）
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
            {(stats.concernDistribution || []).map((item, idx) => {
              const percent = Math.round((item.count / totalConcerns) * 100);
              return (
                <div
                  key={idx}
                  className="bg-[#f8f9fa] border border-[#e1e3e1] p-3 sm:p-4 rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1f1f1f] truncate mr-1">
                      {item.name}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-mono text-[#004a77] bg-[#f0f4f9] px-1.5 sm:px-2 py-0.5 rounded-full font-bold shrink-0">
                      #{idx + 1}
                    </span>
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-[#1f1f1f]">
                    {item.count} <span className="text-xs font-normal text-[#747775]">次</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#e1e3e1] overflow-hidden">
                    <div
                      style={{ width: `${percent}%` }}
                      className="h-full bg-[#004a77] rounded-full"
                    />
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-[#747775] block">
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
