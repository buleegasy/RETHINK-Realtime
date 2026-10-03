import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { AdminStats } from '../../../types';

interface PulseConcernGridProps {
  stats: AdminStats;
  onNavigateToSessionsWithTag: (tag: string) => void;
}

export const PulseConcernGrid: React.FC<PulseConcernGridProps> = ({
  stats,
  onNavigateToSessionsWithTag,
}) => {
  const totalConcerns =
    (stats.concernDistribution || []).reduce((acc, curr) => acc + curr.count, 0) || 1;

  return (
    <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-2xl sm:rounded-3xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f]">议题分布</h3>
        <span className="text-[11px] text-[#747775]">点击议题卡片可直接筛选个案档案</span>
      </div>

      {(stats.concernDistribution || []).length === 0 ? (
        <div className="text-center py-6 sm:py-8 text-xs text-[#747775] bg-[#f8f9fa] rounded-2xl border border-dashed border-[#e1e3e1]">
          暂无议题数据（真实倾诉完成后系统自动统计）
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
          {(stats.concernDistribution || []).map((item, idx) => {
            const percent = Math.round((item.count / totalConcerns) * 100);
            return (
              <button
                type="button"
                key={idx}
                onClick={() => onNavigateToSessionsWithTag(item.name)}
                title={`点击查看“${item.name}”个案档案`}
                className="text-left bg-[#f8f9fa] border border-[#e1e3e1] p-3 sm:p-4 rounded-xl sm:rounded-2xl space-y-1.5 sm:space-y-2 hover:border-[#004a77] hover:bg-[#f0f4f9]/50 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1f1f1f] truncate mr-1 group-hover:text-[#004a77]">
                    {item.name}
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono text-[#004a77] bg-[#f0f4f9] px-1.5 sm:px-2 py-0.5 rounded-full font-bold shrink-0 flex items-center gap-0.5">
                    #{idx + 1}
                    <ArrowUpRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
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
                  {percent}% 占比
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
