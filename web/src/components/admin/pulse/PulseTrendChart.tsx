import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import type { AdminStats } from '../../../types';

const RISK_LEVEL_COLORS = [
  { bg: 'bg-[#146c2e]', text: 'text-[#146c2e]' },
  { bg: 'bg-[#004a77]', text: 'text-[#004a77]' },
  { bg: 'bg-[#f59e0b]', text: 'text-[#b45309]' },
  { bg: 'bg-[#ba1a1a]', text: 'text-[#ba1a1a]' },
];

interface PulseTrendChartProps {
  stats: AdminStats;
}

export const PulseTrendChart: React.FC<PulseTrendChartProps> = ({ stats }) => {
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);

  const maxSessions = Math.max(...(stats.weeklyTrend || []).map((t) => t.sessions), 1);
  const totalRiskCount = (stats.riskDistribution || []).reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      {/* 近 7 天趋势柱状图 */}
      <div className="lg:col-span-2 bg-[#ffffff] border border-[#e1e3e1] rounded-2xl sm:rounded-3xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-4 sm:mb-6">
          <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f]">近 7 天趋势</h3>
          <div className="flex items-center gap-3 text-[11px] sm:text-xs">
            <span className="flex items-center gap-1 text-[#444746]">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-xs bg-[#004a77] inline-block" />
              常规倾诉
            </span>
            <span className="flex items-center gap-1 text-[#444746]">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-xs bg-[#ba1a1a] inline-block" />
              危机预警
            </span>
          </div>
        </div>

        <div className="h-56 sm:h-64 flex items-end justify-between gap-1.5 sm:gap-3 pt-6 border-b border-[#e1e3e1] pb-2 overflow-x-auto min-w-0 relative">
          {(stats.weeklyTrend || []).map((item, i) => {
            const normalCount = Math.max(0, item.sessions - item.crisis);
            const normalHeight = (normalCount / maxSessions) * 100;
            const crisisHeight = (item.crisis / maxSessions) * 100;
            const isHovered = hoveredTrendIdx === i;

            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredTrendIdx(i)}
                onMouseLeave={() => setHoveredTrendIdx(null)}
                className="flex-1 flex flex-col items-center h-full justify-end group min-w-[32px] relative cursor-default"
              >
                {/* Floating tooltip */}
                {isHovered && (
                  <div className="absolute -top-12 z-20 bg-[#1f1f1f] text-white text-[10px] py-1 px-2.5 rounded-lg shadow-lg pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
                    <div className="font-semibold">{item.date}</div>
                    <div>
                      倾诉: {item.sessions} 起 (危机: {item.crisis})
                    </div>
                  </div>
                )}

                {/* 柱顶数量数值 */}
                <span className="text-[10px] font-bold text-[#747775] mb-1 font-mono">
                  {item.sessions > 0 ? item.sessions : ''}
                </span>

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

      {/* 风险分层比例 */}
      <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Layers className="w-4 h-4 text-[#004a77]" />
            <h3 className="text-sm sm:text-base font-bold text-[#1f1f1f]">风险分层</h3>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {(stats.riskDistribution || []).map((r) => {
              const c = RISK_LEVEL_COLORS[r.level] || RISK_LEVEL_COLORS[0];
              const percent = totalRiskCount > 0 ? Math.round((r.count / totalRiskCount) * 100) : 0;

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
  );
};
