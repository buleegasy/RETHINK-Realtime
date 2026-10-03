import React from 'react';
import { TrendingUp, AlertTriangle, Users, HeartHandshake, Activity } from 'lucide-react';
import type { AdminStats, DispositionStatus } from '../../../types';

interface PulseMetricCardsProps {
  stats: AdminStats;
  onNavigateToSessions: (tag?: string | null) => void;
  onNavigateToCrises: (status?: DispositionStatus | 'all') => void;
}

export const PulseMetricCards: React.FC<PulseMetricCardsProps> = ({
  stats,
  onNavigateToSessions,
  onNavigateToCrises,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      {/* 累计倾诉卡片 */}
      <button
        type="button"
        onClick={() => onNavigateToSessions(null)}
        className="text-left bg-[#ffffff] border border-[#e1e3e1] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 cursor-pointer hover:border-[#004a77] hover:shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-[#004a77]"
      >
        <div>
          <span className="text-[11px] sm:text-xs font-medium text-[#5e5e5e] block">累计倾诉</span>
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

      {/* 极高危预警卡片 */}
      <button
        type="button"
        onClick={() => onNavigateToCrises('all')}
        className="text-left bg-[#ffffff] border border-[#f2b8b5] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 cursor-pointer hover:border-[#ba1a1a] hover:shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-[#ba1a1a]"
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

      {/* 待跟进个案卡片 */}
      <button
        type="button"
        onClick={() => onNavigateToCrises('pending_contact')}
        className="text-left bg-[#ffffff] border border-[#feedc2] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 cursor-pointer hover:border-[#b45309] hover:shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-[#b45309]"
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

      {/* 平均情绪效价卡片 */}
      <div className="bg-[#ffffff] border border-[#bbf7d0] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
        <div>
          <span className="text-[11px] sm:text-xs font-medium text-[#166534] block">
            平均情绪效价
          </span>
          <span className="text-xl sm:text-2xl font-bold text-[#146c2e] mt-0.5 sm:mt-1 block">
            {(stats.avgValence ?? 0) > 0 ? `+${stats.avgValence}` : (stats.avgValence ?? 0)}
          </span>
          <span className="text-[10px] sm:text-[11px] text-[#166534] font-medium block mt-1 truncate">
            -1.0 (重度负向) ~ +1.0 (平稳舒畅)
          </span>
        </div>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#f0fdf4] text-[#146c2e] flex items-center justify-center shrink-0 self-end sm:self-auto">
          <Activity className="w-4 h-4 sm:w-6 sm:h-6" />
        </div>
      </div>
    </div>
  );
};
