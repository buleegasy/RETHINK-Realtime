import React, { useState } from 'react';
import {
  RotateCcw,
  X,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import type { AdminSessionItem } from '../../types';

interface SessionRestoreModalProps {
  session: AdminSessionItem;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SessionRestoreModal: React.FC<SessionRestoreModalProps> = ({
  session,
  onClose,
  onSuccess,
}) => {
  const { restoreSession } = useAdminStore();
  const [passcode, setPasscode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setErrorMessage('请输入二次安全口令');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await restoreSession(session.sessionId, passcode.trim());
    setIsSubmitting(false);

    if (res.success) {
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setErrorMessage(res.error || '验证未通过，恢复操作已拦截');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#ffffff] w-full max-w-md max-h-[90vh] rounded-3xl border border-[#bbf7d0] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#f0fdf4] px-6 py-4 border-b border-[#bbf7d0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[#166534]">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <h3 className="text-sm font-bold tracking-tight">
              恢复个案档案
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[#dcfce7] text-[#166534] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto min-h-0 flex-1">
          <p className="text-[#5e5e5e] leading-relaxed">
            该档案此前已被安全归档保护。请输入教师二次安全口令，将其恢复至常规活跃个案库中。
          </p>

          <div className="bg-[#f8f9fa] rounded-2xl p-3 border border-[#e1e3e1] space-y-1">
            <div className="flex justify-between">
              <span className="text-[#747775]">个案编号</span>
              <span className="font-mono font-bold text-[#004a77]">{session.sessionId}</span>
            </div>
            {session.deleteReason && (
              <div className="flex justify-between">
                <span className="text-[#747775]">原归档事由</span>
                <span className="text-[#ba1a1a]">{session.deleteReason}</span>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="bg-[#fce8e6] border border-[#f2b8b5] text-[#ba1a1a] p-3 rounded-xl flex items-center gap-2">
              <span>{errorMessage}</span>
            </div>
          )}

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
              disabled={isSubmitting || !passcode}
              className="px-5 py-2 rounded-xl text-xs font-medium bg-[#146c2e] text-white hover:bg-[#0f5323] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isSubmitting ? '核验恢复中...' : '确认恢复档案'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
