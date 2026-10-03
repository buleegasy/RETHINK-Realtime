import React from 'react';
import {
  Clock,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import type { AdminSessionItem } from '../../types';

interface SessionCardProps {
  session: AdminSessionItem;
  onViewDetail: (session: AdminSessionItem) => void;
  onDelete: (session: AdminSessionItem) => void;
  onRestore: (session: AdminSessionItem) => void;
}

export function renderSessionBadge(s: AdminSessionItem) {
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
        <AlertTriangle className="w-3 h-3" /> 危机预警
      </span>
    );
  }
  return (
    <span className="bg-[#f0fdf4] text-[#146c2e] text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
      <ShieldCheck className="w-3 h-3" /> 脱敏保护
    </span>
  );
}

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onViewDetail,
  onDelete,
  onRestore,
}) => {
  const concerns =
    session.coreConcerns && session.coreConcerns.length > 0 ? session.coreConcerns : ['日常交流'];

  return (
    <div
      className={`bg-[#ffffff] border p-4 sm:p-5 rounded-2xl sm:rounded-3xl transition-all hover:shadow-xs space-y-3 group ${
        session.isDeleted
          ? 'border-[#f2b8b5] bg-[#fffbfb]'
          : 'border-[#e1e3e1] hover:border-[#004a77]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#1f1f1f]">
            {session.deidentifiedReport?.userDisplayName ||
              `来访者 #S${session.sessionId.slice(-4)}`}
          </span>
          {renderSessionBadge(session)}
        </div>

        <div className="flex items-center gap-1 text-xs text-[#747775]">
          <Clock className="w-3.5 h-3.5" />
          <span>
            {Math.floor(session.duration / 60)}分{session.duration % 60}秒
          </span>
        </div>
      </div>

      {session.isDeleted && session.deleteReason && (
        <div className="text-[11px] bg-[#fef2f2] text-[#991b1b] p-2 rounded-xl border border-[#fee2e2]">
          <span className="font-semibold">归档事由：</span>
          <span>{session.deleteReason}</span>
          {session.deletedBy && <span className="text-[#b91c1c] ml-1">({session.deletedBy})</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {concerns.map((c: string, idx: number) => (
          <span
            key={idx}
            className="bg-[#f0f4f9] text-[#004a77] text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full font-medium"
          >
            {c}
          </span>
        ))}
      </div>

      <p className="text-xs text-[#5e5e5e] line-clamp-2 leading-relaxed bg-[#f8f9fa] p-2.5 rounded-xl border border-[#f0f0f0]">
        {session.crisisSummary ||
          session.deidentifiedReport?.emotionalTrajectory?.deltaNotes ||
          '已完成会话交流。'}
      </p>

      <div className="flex items-center justify-between text-[11px] text-[#747775] pt-1 border-t border-[#f0f0f0]">
        <span className="truncate mr-2">
          {new Date(session.createdAt * 1000).toLocaleString('zh-CN')}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onViewDetail(session)}
            className="text-[#004a77] font-medium hover:underline flex items-center gap-0.5 cursor-pointer"
          >
            <span>查看简报</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {session.isDeleted ? (
            <button
              type="button"
              onClick={() => onRestore(session)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0] hover:bg-[#dcfce7] transition-colors flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>恢复</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDelete(session)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#ffffff] text-[#ba1a1a] border border-[#f2b8b5] hover:bg-[#fce8e6] transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>归档/删除</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
