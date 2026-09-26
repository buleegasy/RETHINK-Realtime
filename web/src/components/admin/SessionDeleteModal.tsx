import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  X,
  Lock,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import type { AdminSessionItem } from '../../types';

interface SessionDeleteModalProps {
  session: AdminSessionItem;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SessionDeleteModal: React.FC<SessionDeleteModalProps> = ({
  session,
  onClose,
  onSuccess,
}) => {
  const { deleteSession } = useAdminStore();
  const [passcode, setPasscode] = useState('');
  const [reason, setReason] = useState('');
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isConfirmed = confirmKeyword.trim() === '确认归档';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed) {
      setErrorMessage('请在确认框中输入“确认归档”');
      return;
    }
    if (!passcode.trim()) {
      setErrorMessage('请输入二次安全口令');
      return;
    }
    if (!reason.trim() || reason.trim().length < 2) {
      setErrorMessage('请输入至少2个字的归档事由');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await deleteSession(session.sessionId, passcode.trim(), reason.trim());
    setIsSubmitting(false);

    if (res.success) {
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setErrorMessage(res.error || '验证未通过，删除操作已拦截');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#ffffff] w-full max-w-lg rounded-3xl border border-[#f2b8b5] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#fce8e6] px-6 py-4 border-b border-[#f2b8b5] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#ba1a1a]">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h3 className="text-sm font-bold tracking-tight">
              安全归档与防丢失验证
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[#f8d7da] text-[#ba1a1a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="bg-[#f8f9fa] border border-[#e1e3e1] rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-[#1f1f1f] font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 text-[#b45309]" />
              <span>数据防丢失保护说明</span>
            </div>
            <p className="text-[#5e5e5e] leading-relaxed">
              为最大程度避免数据丢失，系统采用不可逆物理删除拦截机制。本次操作将把该个案标记为安全归档（软删除），原始通话记录、加密数据与评估简报将永久保留在底层数据中心中，随时可由权限教师恢复，且操作全程记入安全审计日志。
            </p>
          </div>

          <div className="bg-[#f0f4f9] rounded-2xl p-3 border border-[#c4c7c5] flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[#747775] block text-[11px]">目标个案编号</span>
              <span className="font-mono font-bold text-[#004a77] text-xs">
                {session.sessionId}
              </span>
            </div>
            <div>
              <span className="text-[#747775] block text-[11px]">时长</span>
              <span className="font-medium text-[#1f1f1f]">
                {Math.floor(session.duration / 60)}分{session.duration % 60}秒
              </span>
            </div>
            <div>
              <span className="text-[#747775] block text-[11px]">发生时间</span>
              <span className="text-[#1f1f1f]">
                {new Date(session.createdAt * 1000).toLocaleString('zh-CN')}
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="bg-[#fce8e6] border border-[#f2b8b5] text-[#ba1a1a] p-3 rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#1f1f1f] mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#004a77]" />
                二次安全口令 (Passcode) <span className="text-[#ba1a1a]">*</span>
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="请输入教师专属二次安全口令"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1f1f1f] mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#004a77]" />
                删除/归档事由 <span className="text-[#ba1a1a]">*</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="请详细说明事由（如：模拟演练数据归档/测试会话/学生申请封存）"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1f1f1f] mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#ba1a1a]" />
                防误触确认：请输入 <span className="font-bold text-[#ba1a1a] font-mono">确认归档</span>
              </label>
              <input
                type="text"
                value={confirmKeyword}
                onChange={(e) => setConfirmKeyword(e.target.value)}
                placeholder="输入 确认归档 激活操作"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#ba1a1a]"
                required
              />
            </div>
          </div>

          <div className="bg-[#f8f9fa] pt-3 -mx-6 -mb-6 px-6 pb-4 border-t border-[#e1e3e1] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-[#ffffff] border border-[#c4c7c5] text-[#444746] hover:bg-[#f0f4f9] transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isConfirmed || !passcode || !reason}
              className="px-5 py-2 rounded-xl text-xs font-medium bg-[#ba1a1a] text-white hover:bg-[#93000a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{isSubmitting ? '验证处理中...' : '核验口令并安全归档'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
