import React, { useMemo } from 'react';
import { Search, X, Tag } from 'lucide-react';
import type { AdminSessionItem } from '../../types';

interface SessionFilterToolbarProps {
  sessions: AdminSessionItem[];
  showArchived: boolean;
  onToggleShowArchived: (archived: boolean) => void;
  filterCrisisOnly: boolean;
  onToggleFilterCrisisOnly: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  sortBy: 'time' | 'duration';
  onSortByChange: (sort: 'time' | 'duration') => void;
  totalFilteredCount: number;
}

export const SessionFilterToolbar: React.FC<SessionFilterToolbarProps> = ({
  sessions,
  showArchived,
  onToggleShowArchived,
  filterCrisisOnly,
  onToggleFilterCrisisOnly,
  searchQuery,
  onSearchChange,
  selectedTag,
  onSelectTag,
  sortBy,
  onSortByChange,
  totalFilteredCount,
}) => {
  // 提取当前列表中出现频率最高的核心关切议题标签
  const topConcernTags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sessions) {
      for (const c of s.coreConcerns || []) {
        if (typeof c === 'string' && c.trim()) {
          counts[c.trim()] = (counts[c.trim()] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);
  }, [sessions]);

  return (
    <div className="space-y-3">
      {/* 顶部主工具条 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-[#ffffff] border border-[#e1e3e1] p-4 sm:p-6 rounded-2xl sm:rounded-3xl">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-bold text-[#1f1f1f] tracking-tight">个案档案</h2>
          <p className="text-xs text-[#747775]">
            真实学生通话咨询数据 · 全流程脱敏与底线防丢失保护
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex bg-[#f0f4f9] p-0.5 sm:p-1 rounded-full text-xs font-medium border border-[#c4c7c5]">
              <button
                type="button"
                onClick={() => onToggleShowArchived(false)}
                className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                  !showArchived
                    ? 'bg-[#ffffff] text-[#004a77] shadow-xs font-semibold'
                    : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
                }`}
              >
                活跃个案
              </button>
              <button
                type="button"
                onClick={() => onToggleShowArchived(true)}
                className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                  showArchived
                    ? 'bg-[#004a77] text-white shadow-xs font-semibold'
                    : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
                }`}
              >
                安全归档库
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleFilterCrisisOnly}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-medium transition-colors border cursor-pointer shrink-0 ${
                filterCrisisOnly
                  ? 'bg-[#ba1a1a] text-white border-[#ba1a1a] shadow-xs'
                  : 'bg-[#ffffff] text-[#444746] border-[#c4c7c5] hover:bg-[#f0f4f9]'
              }`}
            >
              仅看危机
            </button>
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 text-[#747775] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索编号、议题或摘要..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-full border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77]"
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

      {/* 议题标签 Chips 与快捷排序条 */}
      <div className="bg-[#ffffff] border border-[#e1e3e1] p-3 sm:p-4 rounded-xl sm:rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[#747775] font-medium flex items-center gap-1 mr-1">
            <Tag className="w-3.5 h-3.5 text-[#004a77]" />
            <span>议题检索:</span>
          </span>

          <button
            type="button"
            onClick={() => onSelectTag(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
              selectedTag === null
                ? 'bg-[#004a77] text-white shadow-xs'
                : 'bg-[#f0f4f9] text-[#444746] hover:bg-[#e1e3e1]'
            }`}
          >
            全部议题
          </button>

          {topConcernTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                selectedTag === tag
                  ? 'bg-[#004a77] text-white shadow-xs'
                  : 'bg-[#f0f4f9] text-[#444746] hover:bg-[#e1e3e1]'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#f0f0f0]">
          <span className="text-[#747775] text-[11px]">
            共 {sessions.length} 份 · 筛选出 {totalFilteredCount} 份
          </span>

          <div className="flex items-center gap-1 bg-[#f0f4f9] p-0.5 rounded-lg border border-[#c4c7c5]">
            <button
              type="button"
              onClick={() => onSortByChange('time')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer ${
                sortBy === 'time' ? 'bg-white text-[#004a77] shadow-xs' : 'text-[#747775]'
              }`}
            >
              最新时间
            </button>
            <button
              type="button"
              onClick={() => onSortByChange('duration')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer ${
                sortBy === 'duration' ? 'bg-white text-[#004a77] shadow-xs' : 'text-[#747775]'
              }`}
            >
              通话时长
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
