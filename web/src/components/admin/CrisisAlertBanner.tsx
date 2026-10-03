import React from 'react';
import { ShieldAlert, ArrowRight, X } from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';

export const CrisisAlertBanner: React.FC = () => {
  const {
    crises,
    dismissedAlertSessionIds,
    dismissCrisisAlert,
    dismissAllCrisisAlerts,
    navigateToCrisesWithStatus,
  } = useAdminStore();

  const urgentCrises = crises.filter(
    (c) =>
      c.crisisLevel >= 3 &&
      c.dispositionStatus === 'pending_contact' &&
      !dismissedAlertSessionIds.includes(c.sessionId),
  );

  if (urgentCrises.length === 0) return null;

  const topCrisis = urgentCrises[0];
  const totalUrgent = urgentCrises.length;
  const summaryText = topCrisis.crisisSummary || '监测到极高危预警信号';

  return (
    <div
      role="alert"
      className="bg-[#fce8e6] border-b border-[#f2b8b5] px-3.5 sm:px-6 py-2.5 text-[#410e0b] animate-in slide-in-from-top-2 duration-300 select-none"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-[#ba1a1a] text-white flex items-center justify-center shrink-0">
            <ShieldAlert className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs truncate">
            <span className="font-bold text-[#ba1a1a] mr-2">
              【紧急危机通知】
              {totalUrgent > 1 ? `有 ${totalUrgent} 起高危事件待跟进` : '监测到极高危预警'}
            </span>
            <span className="font-mono text-[#601410] bg-white/70 px-1.5 py-0.5 rounded mr-2 border border-[#f2b8b5]">
              #{topCrisis.sessionId.slice(-6)}
            </span>
            <span className="text-[#601410] hidden md:inline truncate">{summaryText}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
          <button
            type="button"
            onClick={() => navigateToCrisesWithStatus('pending_contact')}
            className="px-3 py-1 rounded-full text-xs font-semibold bg-[#ba1a1a] text-white hover:bg-[#93000a] transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <span>立即前往处置</span>
            <ArrowRight className="w-3 h-3" />
          </button>
          {totalUrgent > 1 && (
            <button
              type="button"
              onClick={() => dismissAllCrisisAlerts(urgentCrises.map((c) => c.sessionId))}
              className="px-2 py-0.5 rounded-full text-[11px] text-[#601410] hover:bg-[#f9dedc] transition-colors cursor-pointer hidden sm:inline"
            >
              全部稍后
            </button>
          )}
          <button
            type="button"
            onClick={() => dismissCrisisAlert(topCrisis.sessionId)}
            title="稍后提醒"
            className="p-1 rounded-full hover:bg-[#f9dedc] text-[#601410] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
