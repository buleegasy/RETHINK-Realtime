import React, { useState, useEffect } from 'react';
import {
  Archive,
  Search,
  Clock,
  Sparkles,
  ChevronRight,
  X,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  RotateCcw,
  ShieldAlert,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import type { AdminSessionItem } from '../../types';
import { SessionDeleteModal } from './SessionDeleteModal';
import { SessionRestoreModal } from './SessionRestoreModal';

function renderSessionBadge(s: AdminSessionItem) {
  if (s.isDeleted) {
    return (
      <span className="bg-[#fce8e6] text-[#ba1a1a] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
        <ShieldAlert className="w-3 h-3" /> 已安全归档
      </span>
    );
  }
  if (s.crisisLevel >= 3 || s.isCrisis) {
    return (
      <span className="bg-[#fce8e6] text-[#ba1a1a] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> 危机
      </span>
    );
  }
  return (
    <span className="bg-[#f0fdf4] text-[#146c2e] text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
      <ShieldCheck className="w-3 h-3" /> 脱敏保护
    </span>
  );
}

export const SessionArchiveDrawer: React.FC = () => {
  const {
    sessions,
    fetchSessions,
    isLoading,
    showArchived,
    setShowArchived,
    reEvaluateSession,
  } = useAdminStore();

  const [filterCrisisOnly, setFilterCrisisOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSession, setActiveSession] = useState<AdminSessionItem | null>(null);
  const [deletingSession, setDeletingSession] = useState<AdminSessionItem | null>(null);
  const [restoringSession, setRestoringSession] = useState<AdminSessionItem | null>(null);
  const [isReEvaluating, setIsReEvaluating] = useState(false);
  const [reEvaluateStatus, setReEvaluateStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleReEvaluate = async () => {
    if (!activeSession || isReEvaluating) return;
    setIsReEvaluating(true);
    setReEvaluateStatus(null);
    try {
      const transcript =
        activeSession.deidentifiedReport?.deidentifiedTranscript ||
        activeSession.deidentifiedReport?.emotionalTrajectory?.deltaNotes ||
        activeSession.crisisSummary ||
        '';
      const res = await reEvaluateSession(activeSession.sessionId, transcript);
      if (res && res.success && res.report) {
        setActiveSession((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            deidentifiedReport: res.report,
            coreConcerns: res.report.coreConcerns || res.session?.coreConcerns || prev.coreConcerns,
            crisisSummary: res.report.crisisSummary || res.session?.crisisSummary || prev.crisisSummary,
            crisisLevel: res.session?.crisisLevel ?? prev.crisisLevel,
            isCrisis: res.session?.isCrisis ?? (res.session?.crisisLevel >= 3 || prev.isCrisis),
            emotionalValence: res.session?.emotionalValence ?? prev.emotionalValence,
          };
        });
        setReEvaluateStatus({ type: 'success', message: '已由 DeepSeek V4 Flash 重新提炼并更新档案' });
        setTimeout(() => setReEvaluateStatus(null), 4000);
      } else {
        setReEvaluateStatus({
          type: 'error',
          message: res?.error || '提炼未返回有效数据，请检查网络或后端',
        });
        setTimeout(() => setReEvaluateStatus(null), 5000);
      }
    } catch (err: any) {
      setReEvaluateStatus({
        type: 'error',
        message: err?.message || '提炼请求异常',
      });
      setTimeout(() => setReEvaluateStatus(null), 5000);
    } finally {
      setIsReEvaluating(false);
    }
  };

  useEffect(() => {
    fetchSessions(filterCrisisOnly, showArchived);
  }, [fetchSessions, filterCrisisOnly, showArchived]);

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const concerns = (s.coreConcerns || []).join(' ').toLowerCase();
    const summary = (s.crisisSummary || '').toLowerCase();
    const reason = (s.deleteReason || '').toLowerCase();
    return concerns.includes(q) || summary.includes(q) || s.sessionId.toLowerCase().includes(q) || reason.includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#ffffff] border border-[#e1e3e1] p-6 rounded-3xl">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[#1f1f1f] tracking-tight">
            个案档案
          </h2>
          <p className="text-xs text-[#747775]">
            真实学生通话咨询数据 · 全流程脱敏与底线防丢失保护
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[#f0f4f9] p-1 rounded-full text-xs font-medium border border-[#c4c7c5]">
            <button
              onClick={() => setShowArchived(false)}
              className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                !showArchived
                  ? 'bg-[#ffffff] text-[#004a77] shadow-sm font-semibold'
                  : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
              }`}
            >
              活跃个案
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                showArchived
                  ? 'bg-[#004a77] text-white shadow-sm font-semibold'
                  : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
              }`}
            >
              安全归档库
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#747775] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索编号或议题..."
              className="pl-9 pr-4 py-2 text-xs rounded-full border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77] w-48 sm:w-56"
            />
          </div>

          <button
            onClick={() => setFilterCrisisOnly(!filterCrisisOnly)}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-colors border cursor-pointer ${
              filterCrisisOnly
                ? 'bg-[#ba1a1a] text-white border-[#ba1a1a]'
                : 'bg-[#ffffff] text-[#444746] border-[#c4c7c5] hover:bg-[#f0f4f9]'
            }`}
          >
            仅看危机
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white rounded-3xl p-12 text-center border border-[#e1e3e1]">
          <div className="text-xs text-[#5e5e5e]">正在加载真实个案档案...</div>
        </div>
      )}

      {!isLoading && filteredSessions.length === 0 && (
        <div className="bg-white rounded-3xl p-12 text-center border border-[#e1e3e1] space-y-2">
          <Archive className="w-10 h-10 text-[#c4c7c5] mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-[#1f1f1f]">
            {showArchived ? '暂无安全归档记录' : '暂无真实个案记录'}
          </h4>
          <p className="text-xs text-[#747775]">
            {showArchived
              ? '当前无被安全归档的会话记录。'
              : '管理后台已严格剔除假数据，当学生通过终端完成咨询倾诉后将在此实时建档。'}
          </p>
        </div>
      )}

      {!isLoading && filteredSessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map((s) => (
            <div
              key={s.sessionId}
              className={`bg-[#ffffff] border p-5 rounded-3xl transition-all hover:shadow-sm space-y-3 group ${
                s.isDeleted
                  ? 'border-[#f2b8b5] bg-[#fffbfb]'
                  : 'border-[#e1e3e1] hover:border-[#004a77]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#1f1f1f]">
                    {s.deidentifiedReport?.userDisplayName || `来访者 #S${s.sessionId.slice(-4)}`}
                  </span>
                  {renderSessionBadge(s)}
                </div>

                <div className="flex items-center gap-1 text-xs text-[#747775]">
                  <Clock className="w-3.5 h-3.5" />
                  {Math.floor(s.duration / 60)}分{s.duration % 60}秒
                </div>
              </div>

              {s.isDeleted && s.deleteReason && (
                <div className="text-[11px] bg-[#fef2f2] text-[#991b1b] p-2 rounded-xl border border-[#fee2e2]">
                  <span className="font-semibold">归档事由：</span>
                  {s.deleteReason}
                  {s.deletedBy && <span className="text-[#b91c1c] ml-1">({s.deletedBy})</span>}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {(s.coreConcerns && s.coreConcerns.length > 0 ? s.coreConcerns : ['日常交流']).map((c: string, idx: number) => (
                  <span
                    key={idx}
                    className="bg-[#f0f4f9] text-[#004a77] text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>

              <p className="text-xs text-[#5e5e5e] line-clamp-2 leading-relaxed bg-[#f8f9fa] p-2.5 rounded-xl border border-[#f0f0f0]">
                {s.crisisSummary || s.deidentifiedReport?.emotionalTrajectory?.deltaNotes || '已完成会话交流。'}
              </p>

              <div className="flex items-center justify-between text-[11px] text-[#747775] pt-1 border-t border-[#f0f0f0]">
                <span>{new Date(s.createdAt * 1000).toLocaleString('zh-CN')}</span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveSession(s)}
                    className="text-[#004a77] font-medium hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>查看简报</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {s.isDeleted ? (
                    <button
                      onClick={() => setRestoringSession(s)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0] hover:bg-[#dcfce7] transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      恢复
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeletingSession(s)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#ffffff] text-[#ba1a1a] border border-[#f2b8b5] hover:bg-[#fce8e6] transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      归档/删除
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSession && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] w-full max-w-xl max-h-[90vh] rounded-3xl border border-[#c4c7c5] shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#f0f4f9] px-6 py-4 border-b border-[#e1e3e1] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <Sparkles className="w-4 h-4 text-[#004a77]" />
                <h3 className="text-sm font-bold text-[#1f1f1f]">
                  来访情绪简报 · {activeSession.sessionId}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#e8f0fe] text-[#004a77] border border-[#d2e3fc]">
                  DeepSeek V4 Flash 智能建档
                </span>
              </div>
              <button
                onClick={() => setActiveSession(null)}
                className="p-1.5 rounded-full hover:bg-[#e1e3e1] text-[#747775] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: 自然叙事式个案纪要（去表单化、去机械八股感） */}
            <div className="p-6 space-y-4 overflow-y-auto text-xs min-h-0 flex-1">
              {/* 1. 会谈基本背景与主题标签 */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f8f9fa] border border-[#e1e3e1] p-3.5 rounded-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#e8f0fe] text-[#004a77] flex items-center justify-center font-bold text-xs shrink-0">
                    {activeSession.deidentifiedReport?.userDisplayName?.[0] || '访'}
                  </div>
                  <div>
                    <span className="font-bold text-[#1f1f1f] text-sm block">
                      {activeSession.deidentifiedReport?.userDisplayName || `来访者 #S${activeSession.sessionId.slice(-4)}`}
                    </span>
                    <span className="text-[11px] text-[#747775]">
                      通话时长 {Math.floor(activeSession.duration / 60)}分{activeSession.duration % 60}秒 · {new Date(activeSession.createdAt * 1000).toLocaleString('zh-CN')}
                    </span>
                  </div>
                </div>

                {/* 涉及议题标签 */}
                <div className="flex flex-wrap gap-1.5">
                  {(activeSession.coreConcerns && activeSession.coreConcerns.length > 0
                    ? activeSession.coreConcerns
                    : ['日常交流']
                  ).map((item: string, i: number) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-[#ffffff] border border-[#d2e3fc] text-[#004a77] rounded-full text-[11px] font-medium shadow-2xs"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* 2. 心境演进与倾诉纪要 (自然叙事，不再是僵硬框框) */}
              <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#f0f0f0] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#1f1f1f] text-xs flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-[#004a77]" />
                      心境演进与倾诉纪要
                    </span>
                    {activeSession.deidentifiedReport?.evaluatedBy && (
                      <span className="text-[10px] text-[#004a77] bg-[#e8f0fe] px-2 py-0.5 rounded-full font-medium">
                        {activeSession.deidentifiedReport.evaluatedBy}
                      </span>
                    )}
                  </div>

                  {/* 自然的心境流转胶囊 */}
                  <div className="flex items-center gap-1.5 text-[11px] bg-[#f0fdf4] text-[#166534] px-2.5 py-1 rounded-full border border-[#bbf7d0]">
                    <span className="text-[#5e5e5e]">进线:</span>
                    <span className="font-medium text-[#1f1f1f]">
                      {activeSession.deidentifiedReport?.emotionalTrajectory?.initial || '情绪倾诉'}
                    </span>
                    <ArrowRight className="w-3 h-3 text-[#166534] mx-0.5" />
                    <span className="text-[#5e5e5e]">离开:</span>
                    <span className="font-medium text-[#166534]">
                      {activeSession.deidentifiedReport?.emotionalTrajectory?.final || (activeSession.isCrisis ? '危机干预' : '平和放松')}
                    </span>
                  </div>
                </div>

                {/* 纪要正文（自然段落叙述，富有温度） */}
                <p className="text-xs text-[#333a40] leading-relaxed bg-[#f8f9fa] p-3.5 rounded-xl border border-[#f0f2f5]">
                  {activeSession.deidentifiedReport?.emotionalTrajectory?.deltaNotes || activeSession.crisisSummary || '学生完成了实时语音交流，整体情绪平稳自然。'}
                </p>
              </div>

              {/* 3. 思维与沟通观察 (去清单化，去生硬圆点，自然评述) */}
              <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-2xl p-4 space-y-2">
                <span className="font-semibold text-[#1f1f1f] text-xs block">
                  思维特点与沟通表现
                </span>
                <div className="text-xs text-[#444746] leading-relaxed bg-[#f8f9fa] p-3.5 rounded-xl border border-[#f0f2f5]">
                  {(() => {
                    const rawDistortions = activeSession.deidentifiedReport?.cognitiveDistortions || [];
                    const filtered = rawDistortions
                      .filter(
                        (d: string) =>
                          typeof d === 'string' &&
                          !d.includes('阶段性现实困扰') &&
                          !d.includes('未检测到显著偏执型认知歪曲')
                      )
                      .map((d: string) => d.trim())
                      .filter(Boolean);
                    if (filtered.length === 0) {
                      return '学生在交流中表达流畅自然，情绪体验与叙述事实契合，未见负向思维固化或偏执倾向。';
                    }
                    return filtered.join('；') + '。';
                  })()}
                </div>
              </div>

              {/* 4. 针对性支持与微行动建议 (仅在非空且非套话时柔和呈现) */}
              {(() => {
                const action = activeSession.deidentifiedReport?.homeworkAction?.trim() || '';
                const isBoilerplate =
                  !action ||
                  action.includes('保持规律作息') ||
                  action.includes('写下最近的感受') ||
                  action.includes('深呼吸');
                if (isBoilerplate) return null;
                return (
                  <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-2xl p-4 space-y-1.5 text-xs text-[#92400e]">
                    <span className="font-semibold block text-[#b45309]">
                      课后微行动与协同关怀建议
                    </span>
                    <p className="leading-relaxed">
                      {action}
                    </p>
                  </div>
                );
              })()}
            </div>

            <div className="bg-[#f8f9fa] px-6 py-3 border-t border-[#e1e3e1] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {!activeSession.isDeleted ? (
                  <button
                    onClick={() => {
                      const sess = activeSession;
                      setActiveSession(null);
                      setDeletingSession(sess);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#ba1a1a] hover:bg-[#fce8e6] transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>安全归档</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const sess = activeSession;
                      setActiveSession(null);
                      setRestoringSession(sess);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#166534] hover:bg-[#dcfce7] transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>恢复此档案</span>
                  </button>
                )}

                <button
                  onClick={handleReEvaluate}
                  disabled={isReEvaluating}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#004a77] bg-[#ffffff] border border-[#c4c7c5] hover:bg-[#f0f4f9] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="调用 DeepSeek V4 Flash 重新提炼本次会话的情绪评估简报"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReEvaluating ? 'animate-spin' : ''}`} />
                  <span>{isReEvaluating ? '提炼中...' : '重新提炼简报'}</span>
                </button>

                {reEvaluateStatus && (
                  <span
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-all ${
                      reEvaluateStatus.type === 'success'
                        ? 'text-[#166534] bg-[#dcfce7] border border-[#bbf7d0]'
                        : 'text-[#ba1a1a] bg-[#fee2e2] border border-[#fecaca]'
                    }`}
                  >
                    {reEvaluateStatus.type === 'success' ? '✓ ' : '✕ '}
                    {reEvaluateStatus.message}
                  </span>
                )}
              </div>

              <button
                onClick={() => setActiveSession(null)}
                className="px-5 py-2 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingSession && (
        <SessionDeleteModal
          session={deletingSession}
          onClose={() => setDeletingSession(null)}
          onSuccess={() => setDeletingSession(null)}
        />
      )}

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
