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
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';

export const SessionArchiveDrawer: React.FC = () => {
  const { sessions, fetchSessions, isLoading } = useAdminStore();
  const [filterCrisisOnly, setFilterCrisisOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSession, setActiveSession] = useState<any | null>(null);

  useEffect(() => {
    fetchSessions(filterCrisisOnly);
  }, [fetchSessions, filterCrisisOnly]);

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const concerns = (s.coreConcerns || []).join(' ').toLowerCase();
    const summary = (s.crisisSummary || '').toLowerCase();
    return concerns.includes(q) || summary.includes(q) || s.sessionId.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#ffffff] border border-[#e1e3e1] p-6 rounded-3xl">
        <div>
          <h2 className="text-xl font-bold text-[#1f1f1f] tracking-tight">
            个案档案
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#747775] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索编号或议题..."
              className="pl-9 pr-4 py-2 text-xs rounded-full border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77] w-52"
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

      {isLoading ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-[#e1e3e1]">
          <div className="text-xs text-[#5e5e5e]">正在加载...</div>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-[#e1e3e1]">
          <Archive className="w-10 h-10 text-[#c4c7c5] mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-[#1f1f1f]">无记录</h4>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map((s) => (
            <div
              key={s.sessionId}
              onClick={() => setActiveSession(s)}
              className="bg-[#ffffff] border border-[#e1e3e1] hover:border-[#004a77] p-5 rounded-3xl cursor-pointer transition-all hover:shadow-sm space-y-3 group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#1f1f1f]">
                    {s.deidentifiedReport?.userDisplayName || `来访者 #S${s.sessionId.slice(-4)}`}
                  </span>
                  {s.crisisLevel >= 3 ? (
                    <span className="bg-[#fce8e6] text-[#ba1a1a] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> 危机
                    </span>
                  ) : (
                    <span className="bg-[#f0fdf4] text-[#146c2e] text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> 脱敏
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs text-[#747775]">
                  <Clock className="w-3.5 h-3.5" />
                  {Math.floor(s.duration / 60)}分{s.duration % 60}秒
                  <ChevronRight className="w-4 h-4 text-[#c4c7c5] group-hover:text-[#004a77] transition-colors ml-1" />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(s.coreConcerns || []).map((c: string, idx: number) => (
                  <span
                    key={idx}
                    className="bg-[#f0f4f9] text-[#004a77] text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>

              <p className="text-xs text-[#5e5e5e] line-clamp-2 leading-relaxed bg-[#f8f9fa] p-2.5 rounded-xl border border-[#f0f0f0]">
                {s.crisisSummary || s.deidentifiedReport?.emotionalTrajectory?.deltaNotes || '已完成认知重塑。'}
              </p>

              <div className="flex items-center justify-between text-[11px] text-[#747775] pt-1">
                <span>{new Date(s.createdAt * 1000).toLocaleString('zh-CN')}</span>
                <span className="text-[#004a77] font-medium group-hover:underline">
                  查看简报
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSession && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] w-full max-w-xl max-h-[90vh] rounded-3xl border border-[#c4c7c5] shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#f0f4f9] px-6 py-4 border-b border-[#e1e3e1] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#004a77]" />
                <h3 className="text-sm font-bold text-[#1f1f1f]">
                  CBT 简报 · {activeSession.sessionId}
                </h3>
              </div>
              <button
                onClick={() => setActiveSession(null)}
                className="p-1.5 rounded-full hover:bg-[#e1e3e1] text-[#747775] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              <div className="space-y-1.5">
                <span className="font-semibold text-[#1f1f1f] block">
                  核心议题
                </span>
                <div className="flex flex-wrap gap-2">
                  {(activeSession.coreConcerns || []).map((item: string, i: number) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-[#f0f4f9] text-[#004a77] rounded-full font-medium"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-[#1f1f1f] block">
                  认知特点
                </span>
                <div className="bg-[#f8f9fa] border border-[#e1e3e1] rounded-2xl p-3.5 space-y-1.5">
                  {(activeSession.deidentifiedReport?.cognitiveDistortions || ['偶发性情绪反刍']).map(
                    (d: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[#444746]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#004a77]" />
                        <span>{d}</span>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-[#1f1f1f] block">
                  情绪轨迹
                </span>
                <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[#166534] block font-medium">进线</span>
                      <span className="font-bold text-[#1f1f1f]">
                        {activeSession.deidentifiedReport?.emotionalTrajectory?.initial || '倾诉渴望'}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#166534]" />
                    <div>
                      <span className="text-[#166534] block font-medium">挂机</span>
                      <span className="font-bold text-[#1f1f1f]">
                        {activeSession.deidentifiedReport?.emotionalTrajectory?.final || '情绪平复'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[#444746] pt-2 border-t border-[#bbf7d0] leading-relaxed">
                    {activeSession.deidentifiedReport?.emotionalTrajectory?.deltaNotes || activeSession.crisisSummary}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-[#1f1f1f] block">
                  微行动练习
                </span>
                <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-2xl p-3.5 text-[#92400e] leading-relaxed">
                  {activeSession.deidentifiedReport?.homeworkAction || '尝试进行 4-7-8 腹式深呼吸 3 次。'}
                </div>
              </div>
            </div>

            <div className="bg-[#f8f9fa] px-6 py-3 border-t border-[#e1e3e1] flex justify-end">
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
    </div>
  );
};
