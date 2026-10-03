import React, { useState, useEffect, useMemo } from 'react';
import { Archive, ArrowRight } from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import { useModeStore } from '../../store/modeStore';
import type { AdminSessionItem, AdminCrisisItem } from '../../types';
import { SessionCard } from './SessionCard';
import { SessionFilterToolbar } from './SessionFilterToolbar';
import { SessionDetailModal } from './SessionDetailModal';
import { SessionDeleteModal } from './SessionDeleteModal';
import { SessionRestoreModal } from './SessionRestoreModal';
import { CrisisUnmaskModal } from './CrisisUnmaskModal';

export const SessionArchiveDrawer: React.FC = () => {
  const {
    sessions,
    fetchSessions,
    isLoading,
    showArchived,
    setShowArchived,
    sessionFilterTag,
    setSessionFilterTag,
  } = useAdminStore();

  const [filterCrisisOnly, setFilterCrisisOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'duration'>('time');

  const [activeSession, setActiveSession] = useState<AdminSessionItem | null>(null);
  const [deletingSession, setDeletingSession] = useState<AdminSessionItem | null>(null);
  const [restoringSession, setRestoringSession] = useState<AdminSessionItem | null>(null);
  const [unmaskingCrisis, setUnmaskingCrisis] = useState<AdminCrisisItem | null>(null);

  useEffect(() => {
    fetchSessions(filterCrisisOnly, showArchived);
  }, [fetchSessions, filterCrisisOnly, showArchived]);

  const filteredAndSortedSessions = useMemo(() => {
    let list = sessions.filter((s) => {
      // 1. 危机过滤
      if (filterCrisisOnly && !s.isCrisis && (s.crisisLevel ?? 0) < 3) {
        return false;
      }
      // 2. 核心议题标签过滤
      if (sessionFilterTag && !(s.coreConcerns || []).includes(sessionFilterTag)) {
        return false;
      }
      // 3. 搜索匹配
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const concerns = (s.coreConcerns || []).join(' ').toLowerCase();
        const summary = (s.crisisSummary || '').toLowerCase();
        const reason = (s.deleteReason || '').toLowerCase();
        const displayName = (s.deidentifiedReport?.userDisplayName || '').toLowerCase();
        const match =
          concerns.includes(q) ||
          summary.includes(q) ||
          s.sessionId.toLowerCase().includes(q) ||
          reason.includes(q) ||
          displayName.includes(q);
        if (!match) return false;
      }
      return true;
    });

    // 排序
    return list.sort((a, b) => {
      if (sortBy === 'duration') {
        return b.duration - a.duration;
      }
      return b.createdAt - a.createdAt;
    });
  }, [sessions, filterCrisisOnly, sessionFilterTag, searchQuery, sortBy]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 筛选与检索工具栏 */}
      <SessionFilterToolbar
        sessions={sessions}
        showArchived={showArchived}
        onToggleShowArchived={setShowArchived}
        filterCrisisOnly={filterCrisisOnly}
        onToggleFilterCrisisOnly={() => setFilterCrisisOnly(!filterCrisisOnly)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedTag={sessionFilterTag}
        onSelectTag={setSessionFilterTag}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        totalFilteredCount={filteredAndSortedSessions.length}
      />

      {isLoading && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center border border-[#e1e3e1]">
          <div className="text-xs text-[#5e5e5e]">正在加载真实个案档案...</div>
        </div>
      )}

      {!isLoading && filteredAndSortedSessions.length === 0 && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center border border-[#e1e3e1] space-y-3">
          <Archive className="w-9 h-9 sm:w-10 sm:h-10 text-[#c4c7c5] mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-[#1f1f1f]">
            {showArchived
              ? '暂无安全归档记录'
              : sessionFilterTag || searchQuery || filterCrisisOnly
                ? '未找到符合条件的个案记录'
                : '暂无真实个案记录'}
          </h4>
          <p className="text-xs text-[#747775] max-w-md mx-auto leading-relaxed">
            {showArchived
              ? '当前无被安全归档的会话记录。'
              : sessionFilterTag || searchQuery || filterCrisisOnly
                ? '请尝试清除检索关键词或取消选中的议题标签以查看全部个案。'
                : '管理后台已严格剔除假数据，当来访者通过终端或网页完成一次倾诉交流后，系统将自动提炼 CBT 认知评估并在此建档。'}
          </p>
          {(sessionFilterTag || searchQuery || filterCrisisOnly) && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setSessionFilterTag(null);
                  setSearchQuery('');
                  setFilterCrisisOnly(false);
                }}
                className="text-xs text-[#004a77] hover:underline cursor-pointer"
              >
                重置所有筛选条件
              </button>
            </div>
          )}
          {!showArchived && !sessionFilterTag && !searchQuery && !filterCrisisOnly && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => useModeStore.getState().setRunMode('web')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#004a77] text-white text-xs font-medium hover:bg-[#003355] transition-colors cursor-pointer shadow-xs"
              >
                <span>前往体验倾诉建档</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {!isLoading && filteredAndSortedSessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {filteredAndSortedSessions.map((s) => (
            <SessionCard
              key={s.sessionId}
              session={s}
              onViewDetail={(session) => setActiveSession(session)}
              onDelete={(session) => setDeletingSession(session)}
              onRestore={(session) => setRestoringSession(session)}
            />
          ))}
        </div>
      )}

      {/* 会话详情简报与 CBT 深度干预弹窗 */}
      {activeSession && (
        <SessionDetailModal
          session={activeSession}
          onClose={() => setActiveSession(null)}
          onOpenDelete={(s) => setDeletingSession(s)}
          onOpenRestore={(s) => setRestoringSession(s)}
          onOpenUnmask={(c) => setUnmaskingCrisis(c)}
        />
      )}

      {/* 危机身份解密弹窗 */}
      {unmaskingCrisis && (
        <CrisisUnmaskModal crisis={unmaskingCrisis} onClose={() => setUnmaskingCrisis(null)} />
      )}

      {/* 安全归档确认弹窗 */}
      {deletingSession && (
        <SessionDeleteModal
          session={deletingSession}
          onClose={() => setDeletingSession(null)}
          onSuccess={() => setDeletingSession(null)}
        />
      )}

      {/* 恢复档案确认弹窗 */}
      {restoringSession && (
        <SessionRestoreModal
          session={restoringSession}
          onClose={() => setRestoringSession(null)}
          onSuccess={() => setRestoringSession(null)}
        />
      )}
    </div>
  );
};
