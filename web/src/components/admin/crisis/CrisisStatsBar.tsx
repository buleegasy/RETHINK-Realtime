import React from 'react';
import { Search, X } from 'lucide-react';
import type { DispositionStatus } from '../../../types';

interface CrisisStatsBarProps {
  pendingCount: number;
  intervenedCount: number;
  closedCount: number;
  totalCount: number;
  crisisFilterStatus: DispositionStatus | 'all';
  onFilterStatusChange: (status: DispositionStatus | 'all') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const CrisisStatsBar: React.FC<CrisisStatsBarProps> = ({
  pendingCount,
  intervenedCount,
  closedCount,
  totalCount,
  crisisFilterStatus,
  onFilterStatusChange,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 头部统计状态摘要 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-[#ffffff] border border-[#e1e3e1] p-4 sm:p-6 rounded-2xl sm:rounded-3xl">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-bold text-[#1f1f1f] tracking-tight">危机中心</h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={() =>
              onFilterStatusChange(
                crisisFilterStatus === 'pending_contact' ? 'all' : 'pending_contact',
              )
            }
            className={`flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 rounded-2xl border text-center transition-all cursor-pointer ${
              crisisFilterStatus === 'pending_contact'
                ? 'bg-[#ba1a1a] text-white border-[#ba1a1a] shadow-xs'
                : 'bg-[#fce8e6] text-[#601410] border-[#f2b8b5] hover:border-[#ba1a1a]'
            }`}
          >
            <span className="text-[10px] sm:text-[11px] font-medium block">待跟进</span>
            <span className="text-sm sm:text-base font-bold">{pendingCount} 起</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onFilterStatusChange(crisisFilterStatus === 'intervened' ? 'all' : 'intervened')
            }
            className={`flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 rounded-2xl border text-center transition-all cursor-pointer ${
              crisisFilterStatus === 'intervened'
                ? 'bg-[#004a77] text-white border-[#004a77] shadow-xs'
                : 'bg-[#f0f4f9] text-[#004a77] border-[#c4c7c5] hover:border-[#004a77]'
            }`}
          >
            <span className="text-[10px] sm:text-[11px] font-medium block">已介入</span>
            <span className="text-sm sm:text-base font-bold">{intervenedCount} 起</span>
          </button>

          <button
            type="button"
            onClick={() => onFilterStatusChange(crisisFilterStatus === 'closed' ? 'all' : 'closed')}
            className={`flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 rounded-2xl border text-center transition-all cursor-pointer ${
              crisisFilterStatus === 'closed'
                ? 'bg-[#146c2e] text-white border-[#146c2e] shadow-xs'
                : 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0] hover:border-[#146c2e]'
            }`}
          >
            <span className="text-[10px] sm:text-[11px] font-medium block">已结案</span>
            <span className="text-sm sm:text-base font-bold">{closedCount} 起</span>
          </button>
        </div>
      </div>

      {/* 搜索与多态切换工具条 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4 bg-[#ffffff] border border-[#e1e3e1] p-3 sm:p-4 rounded-xl sm:rounded-2xl">
        <div className="flex bg-[#f0f4f9] p-0.5 sm:p-1 rounded-full text-xs font-medium border border-[#c4c7c5] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onFilterStatusChange('all')}
            className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
              crisisFilterStatus === 'all'
                ? 'bg-[#ffffff] text-[#004a77] shadow-xs font-semibold'
                : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
            }`}
          >
            全部 ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => onFilterStatusChange('pending_contact')}
            className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
              crisisFilterStatus === 'pending_contact'
                ? 'bg-[#ba1a1a] text-white shadow-xs font-semibold'
                : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
            }`}
          >
            待跟进 ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => onFilterStatusChange('intervened')}
            className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
              crisisFilterStatus === 'intervened'
                ? 'bg-[#004a77] text-white shadow-xs font-semibold'
                : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
            }`}
          >
            已介入 ({intervenedCount})
          </button>
          <button
            type="button"
            onClick={() => onFilterStatusChange('closed')}
            className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
              crisisFilterStatus === 'closed'
                ? 'bg-[#146c2e] text-white shadow-xs font-semibold'
                : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
            }`}
          >
            已结案 ({closedCount})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#747775] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索学生姓名、编号或摘要..."
            className="w-full pl-9 pr-8 py-1.5 sm:py-2 text-xs rounded-full border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#747775] hover:text-[#1f1f1f] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
