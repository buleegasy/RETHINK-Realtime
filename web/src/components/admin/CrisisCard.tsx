import React from 'react';
import {
  ShieldAlert,
  AlertCircle,
  Eye,
  Clock,
  MapPin,
  Sparkles,
  Save,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import type {
  AdminCrisisItem,
  AdminSessionItem,
  DispositionStatus,
  UnmaskedIdentity,
} from '../../types';

interface CrisisCardProps {
  item: AdminCrisisItem;
  unmasked?: UnmaskedIdentity;
  editingNote: string;
  onNoteChange: (val: string) => void;
  onSaveNote: () => void;
  isSavingNote: boolean;
  isUpdatingStatus: boolean;
  savedFeedback?: string;
  onStatusChange: (status: DispositionStatus) => void;
  onUnmask: (item: AdminCrisisItem) => void;
  onDelete: (item: AdminSessionItem) => void;
}

export const CrisisCard: React.FC<CrisisCardProps> = ({
  item,
  unmasked,
  editingNote,
  onNoteChange,
  onSaveNote,
  isSavingNote,
  isUpdatingStatus,
  savedFeedback,
  onStatusChange,
  onUnmask,
  onDelete,
}) => {
  const isPending = item.dispositionStatus === 'pending_contact';

  const toSessionItem = (): AdminSessionItem => ({
    id: item.sessionId,
    sessionId: item.sessionId,
    duration: item.duration,
    stage: 'Crisis_Escalation',
    isCrisis: true,
    crisisLevel: item.crisisLevel,
    crisisSummary: item.crisisSummary,
    coreConcerns: item.coreConcerns,
    emotionalValence: item.emotionalValence,
    deidentifiedReport: null,
    dispositionStatus: item.dispositionStatus,
    dispositionNote: item.dispositionNote,
    isDeleted: false,
    deletedAt: null,
    deleteReason: null,
    deletedBy: null,
    createdAt: item.createdAt,
    hasEncryptedIdentity: item.hasEncryptedIdentity,
  });

  return (
    <div
      className={`bg-[#ffffff] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border transition-all ${
        isPending
          ? 'border-[#ba1a1a] shadow-sm hover:border-[#93000a]'
          : 'border-[#c4c7c5] hover:border-[#004a77]'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 sm:gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#fce8e6] text-[#ba1a1a] flex items-center justify-center shrink-0 font-bold">
            <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="bg-[#ba1a1a] text-white text-[11px] sm:text-xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full flex items-center gap-1">
                {isPending && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                极高危预警 (Level {item.crisisLevel})
              </span>
              <span className="text-[11px] sm:text-xs font-mono text-[#5e5e5e] bg-[#f0f4f9] px-2 py-0.5 rounded-full">
                #{item.sessionId.slice(-6)}
              </span>
              <span className="text-[11px] sm:text-xs text-[#5e5e5e] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {new Date(item.createdAt * 1000).toLocaleString('zh-CN')}
              </span>
            </div>

            <div className="flex items-center gap-1 text-[11px] sm:text-xs text-[#444746] mt-1.5 sm:mt-2">
              <MapPin className="w-3.5 h-3.5 text-[#004a77]" />
              <span>
                终端 #01 · 时长: {Math.floor(item.duration / 60)}分{item.duration % 60}秒
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-[#f0f0f0]">
          <div className="flex bg-[#f0f4f9] p-0.5 sm:p-1 rounded-full text-xs font-medium border border-[#c4c7c5] flex-1 sm:flex-initial justify-around sm:justify-start">
            <button
              type="button"
              onClick={() => onStatusChange('pending_contact')}
              disabled={isUpdatingStatus}
              className={`px-2.5 sm:px-3 py-1 rounded-full transition-all cursor-pointer ${
                item.dispositionStatus === 'pending_contact'
                  ? 'bg-[#ba1a1a] text-white font-semibold shadow-xs'
                  : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
              } disabled:opacity-50`}
            >
              待跟进
            </button>
            <button
              type="button"
              onClick={() => onStatusChange('intervened')}
              disabled={isUpdatingStatus}
              className={`px-2.5 sm:px-3 py-1 rounded-full transition-all cursor-pointer ${
                item.dispositionStatus === 'intervened'
                  ? 'bg-[#004a77] text-white font-semibold shadow-xs'
                  : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
              } disabled:opacity-50`}
            >
              已介入
            </button>
            <button
              type="button"
              onClick={() => onStatusChange('closed')}
              disabled={isUpdatingStatus}
              className={`px-2.5 sm:px-3 py-1 rounded-full transition-all cursor-pointer ${
                item.dispositionStatus === 'closed'
                  ? 'bg-[#146c2e] text-white font-semibold shadow-xs'
                  : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
              } disabled:opacity-50`}
            >
              已结案
            </button>
          </div>

          <button
            type="button"
            onClick={() => onDelete(toSessionItem())}
            title="安全归档此危机记录"
            className="p-2 rounded-full border border-[#f2b8b5] text-[#ba1a1a] hover:bg-[#fce8e6] transition-colors cursor-pointer shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="bg-[#fce8e6]/40 border border-[#f2b8b5] rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-3 sm:mb-4">
        <div className="flex items-start gap-2 sm:gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#ba1a1a] shrink-0 mt-0.5" />
          <div className="text-xs text-[#410e0b]">
            <span className="font-bold">判定摘要：</span>
            {item.crisisSummary}
          </div>
        </div>
      </div>

      <div className="bg-[#f8f9fa] border border-[#e1e3e1] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div className="space-y-1">
          <span className="text-[10px] sm:text-[11px] font-semibold text-[#747775] block uppercase tracking-wider">
            身份信息
          </span>
          {!unmasked ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1f1f1f]">
                来访学生 #S{item.sessionId.slice(-4)}
              </span>
              <span className="bg-[#fee2e2] text-[#991b1b] text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full font-medium">
                脱敏保护中
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-sm sm:text-base font-bold text-[#166534]">
                {unmasked.realName} (学号: {unmasked.username})
              </span>
              <span className="text-xs text-[#15803d] font-medium bg-[#dcfce7] px-2.5 py-0.5 rounded-full">
                {unmasked.gradeClass}
              </span>
              <span className="text-xs text-[#1f1f1f] bg-white border border-[#c4c7c5] px-2.5 py-0.5 rounded-full">
                {unmasked.emergencyContact}
              </span>
            </div>
          )}
        </div>

        <div className="w-full sm:w-auto">
          {!unmasked ? (
            <button
              type="button"
              onClick={() => onUnmask(item)}
              className="w-full sm:w-auto justify-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-semibold bg-[#ba1a1a] text-white hover:bg-[#93000a] transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>查看学生身份</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUnmask(item)}
              className="w-full sm:w-auto justify-center px-4 py-2 rounded-full text-xs font-medium bg-[#ffffff] border border-[#c4c7c5] text-[#004a77] hover:bg-[#f0f4f9] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>查看详情</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={editingNote}
            onChange={(e) => onNoteChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSaveNote();
              }
            }}
            placeholder="处置记录与跟进说明..."
            title="按回车键可直接保存说明"
            className="w-full flex-1 px-3.5 py-2 text-xs rounded-xl border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77]"
          />
          <button
            type="button"
            onClick={onSaveNote}
            disabled={isSavingNote}
            className="w-full sm:w-auto justify-center px-4 py-2 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingNote ? '保存中...' : '保存说明'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-[11px] min-h-[1.25rem]">
          {savedFeedback ? (
            <span className="text-[#15803d] font-semibold flex items-center gap-1.5 bg-[#f0fdf4] px-2.5 py-0.5 rounded-full border border-[#bbf7d0] animate-in fade-in duration-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#16a34a]" />
              {savedFeedback}
            </span>
          ) : (
            <span className="text-[#747775]">点击状态或保存说明将即时持久化同步</span>
          )}
        </div>
      </div>
    </div>
  );
};
