import React from 'react';
import { Activity, ArrowRight } from 'lucide-react';
import type { AdminSessionItem } from '../../../types';

interface SessionCbtReportViewProps {
  session: AdminSessionItem;
}

export const SessionCbtReportView: React.FC<SessionCbtReportViewProps> = ({ session }) => {
  const concerns =
    session.coreConcerns && session.coreConcerns.length > 0 ? session.coreConcerns : ['日常交流'];

  return (
    <>
      {/* 1. 会谈基本背景与主题标签 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f8f9fa] border border-[#e1e3e1] p-3 sm:p-3.5 rounded-xl sm:rounded-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#e8f0fe] text-[#004a77] flex items-center justify-center font-bold text-xs shrink-0">
            {session.deidentifiedReport?.userDisplayName?.[0] || '访'}
          </div>
          <div>
            <span className="font-bold text-[#1f1f1f] text-sm block">
              {session.deidentifiedReport?.userDisplayName ||
                `来访者 #S${session.sessionId.slice(-4)}`}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#747775]">
              时长 {Math.floor(session.duration / 60)}分{session.duration % 60}秒 ·{' '}
              {new Date(session.createdAt * 1000).toLocaleString('zh-CN')}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {concerns.map((item: string, i: number) => (
            <span
              key={i}
              className="px-2.5 py-0.5 sm:py-1 bg-[#ffffff] border border-[#d2e3fc] text-[#004a77] rounded-full text-[10px] sm:text-[11px] font-medium shadow-2xs"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* 2. 心境演进与倾诉纪要 */}
      <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 space-y-2.5 sm:space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0f0f0] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#1f1f1f] text-xs flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#004a77]" />
              心境演进与倾诉纪要
            </span>
            {session.deidentifiedReport?.evaluatedBy && (
              <span className="text-[9px] sm:text-[10px] text-[#004a77] bg-[#e8f0fe] px-2 py-0.5 rounded-full font-medium">
                {session.deidentifiedReport.evaluatedBy}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] bg-[#f0fdf4] text-[#166534] px-2.5 py-1 rounded-full border border-[#bbf7d0] self-start sm:self-auto">
            <span className="text-[#5e5e5e]">进线:</span>
            <span className="font-medium text-[#1f1f1f]">
              {session.deidentifiedReport?.emotionalTrajectory?.initial || '情绪倾诉'}
            </span>
            <ArrowRight className="w-3 h-3 text-[#166534] mx-0.5" />
            <span className="text-[#5e5e5e]">离开:</span>
            <span className="font-medium text-[#166534]">
              {session.deidentifiedReport?.emotionalTrajectory?.final ||
                (session.isCrisis ? '危机干预' : '平和放松')}
            </span>
          </div>
        </div>

        <p className="text-xs text-[#333a40] leading-relaxed bg-[#f8f9fa] p-3 sm:p-3.5 rounded-xl border border-[#f0f2f5]">
          {session.deidentifiedReport?.emotionalTrajectory?.deltaNotes ||
            session.crisisSummary ||
            '学生完成了实时语音交流，整体情绪平稳自然。'}
        </p>
      </div>

      {/* 3. 思维特点与沟通表现 */}
      <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 space-y-2">
        <span className="font-semibold text-[#1f1f1f] text-xs block">思维特点与沟通表现</span>
        <div className="text-xs text-[#444746] leading-relaxed bg-[#f8f9fa] p-3 sm:p-3.5 rounded-xl border border-[#f0f2f5]">
          {(() => {
            const rawDistortions = session.deidentifiedReport?.cognitiveDistortions || [];
            const filtered = rawDistortions
              .filter(
                (d: string) =>
                  typeof d === 'string' &&
                  !d.includes('阶段性现实困扰') &&
                  !d.includes('未检测到显著偏执型认知歪曲'),
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

      {/* 4. 建议与微行动 */}
      {(() => {
        const action = session.deidentifiedReport?.homeworkAction?.trim() || '';
        const isBoilerplate =
          !action ||
          action.includes('保持规律作息') ||
          action.includes('写下最近的感受') ||
          action.includes('深呼吸');
        if (isBoilerplate) return null;
        return (
          <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 space-y-1.5 text-xs text-[#92400e]">
            <span className="font-semibold block text-[#b45309]">课后微行动与协同关怀建议</span>
            <p className="leading-relaxed">{action}</p>
          </div>
        );
      })()}
    </>
  );
};
