import React, { useState } from 'react';
import {
  ShieldAlert,
  KeyRound,
  UserCheck,
  Phone,
  Copy,
  Check,
  X,
  FileCheck2,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import type { AdminCrisisItem } from '../../types';

interface CrisisUnmaskModalProps {
  crisis: AdminCrisisItem | null;
  onClose: () => void;
}

export const CrisisUnmaskModal: React.FC<CrisisUnmaskModalProps> = ({ crisis, onClose }) => {
  const { unmaskCrisis, unmaskedMap, teacherProfile } = useAdminStore();
  const [passcode, setPasscode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!crisis) return null;

  const currentUnmasked = unmaskedMap[crisis.sessionId];

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setErrorMessage('请输入安全口令');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await unmaskCrisis(
      crisis.sessionId,
      passcode.trim(),
      teacherProfile?.displayName || '教师'
    );

    setIsSubmitting(false);
    if (!res.success) {
      setErrorMessage(res.error || '口令错误');
    }
  };

  const copyContact = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#000000]/60 flex items-center justify-center p-4">
      <div className="bg-[#ffffff] w-full max-w-lg rounded-3xl border border-[#c4c7c5] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#fce8e6] px-6 py-4 border-b border-[#f2b8b5] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-[#ba1a1a]" />
            <h3 className="text-sm font-semibold text-[#410e0b]">
              身份查验 · {crisis.sessionId}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[#f9dedc] text-[#601410] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {!currentUnmasked ? (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1f1f1f] mb-2 flex items-center gap-1.5 font-mono">
                  <KeyRound className="w-4 h-4 text-[#004a77]" />
                  安全口令
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="teacher-safe-2026"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-[#c4c7c5] focus:outline-none focus:border-[#004a77] bg-[#ffffff]"
                  autoFocus
                />
                {errorMessage && (
                  <p className="text-xs font-medium text-[#ba1a1a] mt-2">
                    {errorMessage}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#f0f4f9]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#444746] hover:bg-[#f0f4f9] transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-medium bg-[#ba1a1a] text-white hover:bg-[#93000a] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? '验证中...' : '确认'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[#166534] font-medium">
                  <UserCheck className="w-4 h-4" />
                  验证通过
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[#15803d]">
                  <FileCheck2 className="w-3.5 h-3.5" />
                  已记录审计
                </div>
              </div>

              <div className="bg-[#f8f9fa] border border-[#e1e3e1] rounded-2xl p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[#747775] block mb-0.5">姓名</span>
                    <span className="text-base font-bold text-[#1f1f1f]">
                      {currentUnmasked.realName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#747775] block mb-0.5">学号</span>
                    <span className="text-sm font-semibold text-[#004a77] font-mono">
                      {currentUnmasked.username}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#e1e3e1]">
                  <div>
                    <span className="text-[#747775] block mb-0.5">班级</span>
                    <span className="text-sm font-medium text-[#1f1f1f]">
                      {currentUnmasked.gradeClass}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#747775] block mb-0.5">位置</span>
                    <span className="text-sm font-medium text-[#1f1f1f]">
                      {currentUnmasked.boothLocation}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#e1e3e1]">
                  <span className="text-[#747775] block mb-1">紧急联系</span>
                  <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-[#c4c7c5]">
                    <span className="font-medium text-[#1f1f1f] flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-[#146c2e]" />
                      {currentUnmasked.emergencyContact}
                    </span>
                    <button
                      onClick={() => copyContact(currentUnmasked.emergencyContact)}
                      className="px-2.5 py-1 rounded-lg bg-[#f0f4f9] hover:bg-[#e9eef6] text-[#004a77] font-medium flex items-center gap-1 transition-colors text-[11px] cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3 text-[#146c2e]" /> 已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> 复制
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#e1e3e1]">
                  <span className="text-[#747775] block mb-1">风险说明</span>
                  <p className="text-xs text-[#ba1a1a] bg-[#fff5f5] p-2.5 rounded-xl border border-[#fed7d7] leading-relaxed">
                    {currentUnmasked.crisisNote}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
