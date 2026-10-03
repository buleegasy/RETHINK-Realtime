import React, { useEffect } from 'react';
import { Activity, Sparkles, RefreshCw } from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import { PulseMetricCards } from './pulse/PulseMetricCards';
import { PulseTrendChart } from './pulse/PulseTrendChart';
import { PulseConcernGrid } from './pulse/PulseConcernGrid';

export const CampusPulseDashboard: React.FC = () => {
  const {
    stats,
    isLoadingStats,
    fetchStats,
    lastStatsRefreshTime,
    navigateToCrisesWithStatus,
    navigateToSessionsWithTag,
  } = useAdminStore();

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

  const formatRefreshTime = () => {
    if (!lastStatsRefreshTime) return '实时同步';
    const d = new Date(lastStatsRefreshTime);
    return `${d.getHours().toString().padStart(2, '0')}:${d
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 状态与手动刷新条 */}
      <div className="flex items-center justify-between text-xs text-[#747775] px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#146c2e] inline-block animate-pulse" />
        </div>

        <button
          type="button"
          onClick={() => fetchStats()}
          disabled={isLoadingStats}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#c4c7c5] hover:bg-[#f0f4f9] text-[#004a77] font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isLoadingStats ? 'animate-spin' : ''}`} />
          <span>{isLoadingStats ? '同步中...' : `刷新数据 (${formatRefreshTime()})`}</span>
        </button>
      </div>

      {/* 4 大核心指标卡片 */}
      <PulseMetricCards
        stats={stats}
        onNavigateToSessions={navigateToSessionsWithTag}
        onNavigateToCrises={navigateToCrisesWithStatus}
      />

      {/* 本周小结 (AI生成) */}
      <div className="bg-gradient-to-r from-[#f0f4f9] via-[#ffffff] to-[#f8f9fa] border border-[#d2e3fc] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xs">
        <div className="flex items-center justify-between gap-3 mb-2 sm:mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-[#e8f0fe] text-[#004a77] flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#004a77]" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-[#1f1f1f] tracking-tight">本周小结</h3>
          </div>
          <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] text-[#5e5e5e] bg-[#ffffff] border border-[#d2e3fc] font-medium">
            AI 智能生成
          </span>
        </div>
        <p className="text-xs text-[#333a40] leading-relaxed pl-0 sm:pl-9 mt-1 sm:mt-0 font-normal">
          {stats.weeklySummary ||
            (stats.totalSessions === 0
              ? '当前暂无足够的学生来访数据，各咨询终端正常就绪待命。'
              : '本周学生多以轻量交流与日常寒暄为主，整体心境平和自然，未见群体性学业或情绪焦虑集聚。')}
        </p>
      </div>

      {/* 近 7 天趋势与风险分层 */}
      <PulseTrendChart stats={stats} />

      {/* 议题分布 */}
      <PulseConcernGrid stats={stats} onNavigateToSessionsWithTag={navigateToSessionsWithTag} />
    </div>
  );
};
