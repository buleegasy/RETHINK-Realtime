import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import type { AdminCrisisItem, AdminSessionItem, DispositionStatus } from '../../types';
import { CrisisCard } from './CrisisCard';
import { CrisisUnmaskModal } from './CrisisUnmaskModal';
import { SessionDeleteModal } from './SessionDeleteModal';
import { CrisisStatsBar } from './crisis/CrisisStatsBar';

export const CrisisResponseCenter: React.FC = () => {
  const {
    crises,
    unmaskedMap,
    updateDisposition,
    fetchCrises,
    fetchStats,
    crisisFilterStatus,
    setCrisisFilterStatus,
  } = useAdminStore();

  const [selectedCrisis, setSelectedCrisis] = useState<AdminCrisisItem | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [savedFeedback, setSavedFeedback] = useState<Record<string, string>>({});
  const [deletingCrisis, setDeletingCrisis] = useState<AdminSessionItem | null>(null);
  const [crisisSearchQuery, setCrisisSearchQuery] = useState('');

  const handleStatusChange = async (sessionId: string, status: DispositionStatus) => {
    setStatusUpdating((prev) => ({ ...prev, [sessionId]: true }));
    const note = editingNotes[sessionId];
    const ok = await updateDisposition(sessionId, status, note);
    setStatusUpdating((prev) => ({ ...prev, [sessionId]: false }));
    if (ok) {
      const labels: Record<DispositionStatus, string> = {
        pending_contact: '已恢复为待跟进状态',
        intervened: '已介入并保存',
        closed: '已结案并保存',
      };
      setSavedFeedback((prev) => ({ ...prev, [sessionId]: labels[status] || '已保存' }));
      setTimeout(() => {
        setSavedFeedback((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      }, 2500);
      fetchStats();
      fetchCrises();
    }
  };

  const handleSaveNote = async (sessionId: string, currentStatus: DispositionStatus) => {
    setSavingMap((prev) => ({ ...prev, [sessionId]: true }));
    const note = editingNotes[sessionId];
    const ok = await updateDisposition(sessionId, currentStatus, note);
    setSavingMap((prev) => ({ ...prev, [sessionId]: false }));
    if (ok) {
      setSavedFeedback((prev) => ({ ...prev, [sessionId]: '说明记录已保存' }));
      setTimeout(() => {
        setSavedFeedback((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      }, 2500);
      fetchStats();
      fetchCrises();
    }
  };

  const pendingCount = crises.filter((c) => c.dispositionStatus === 'pending_contact').length;
  const intervenedCount = crises.filter((c) => c.dispositionStatus === 'intervened').length;
  const closedCount = crises.filter((c) => c.dispositionStatus === 'closed').length;

  const filteredCrises = crises.filter((item) => {
    if (crisisFilterStatus !== 'all' && item.dispositionStatus !== crisisFilterStatus) {
      return false;
    }
    if (!crisisSearchQuery.trim()) return true;
    const q = crisisSearchQuery.toLowerCase();
    const unmasked = unmaskedMap[item.sessionId];
    const matchName = unmasked?.realName.toLowerCase().includes(q);
    const matchUsername = unmasked?.username.toLowerCase().includes(q);
    const matchSummary = (item.crisisSummary || '').toLowerCase().includes(q);
    const matchSessionId = item.sessionId.toLowerCase().includes(q);
    const matchConcerns = (item.coreConcerns || []).join(' ').toLowerCase().includes(q);
    return matchName || matchUsername || matchSummary || matchSessionId || matchConcerns;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <CrisisStatsBar
        pendingCount={pendingCount}
        intervenedCount={intervenedCount}
        closedCount={closedCount}
        totalCount={crises.length}
        crisisFilterStatus={crisisFilterStatus}
        onFilterStatusChange={setCrisisFilterStatus}
        searchQuery={crisisSearchQuery}
        onSearchChange={setCrisisSearchQuery}
      />

      {crises.length === 0 ? (
        <div className="bg-[#ffffff] border border-[#c4eed0] rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center space-y-2">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#e8f5e9] text-[#146c2e] flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <h3 className="text-sm font-semibold text-[#1f1f1f]">当前无危机预警事件</h3>
          <p className="text-xs text-[#747775] max-w-md mx-auto">
            管理后台已启用实时监听与脱敏穿透机制，一旦终端监测到极端风险意向将在此即刻告警。
          </p>
        </div>
      ) : filteredCrises.length === 0 ? (
        <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-2xl sm:rounded-3xl p-8 text-center space-y-2">
          <p className="text-xs text-[#747775]">未找到符合当前筛选条件的危机事件</p>
          <button
            type="button"
            onClick={() => {
              setCrisisFilterStatus('all');
              setCrisisSearchQuery('');
            }}
            className="text-xs text-[#004a77] hover:underline cursor-pointer"
          >
            清除筛选条件
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:gap-5">
          {filteredCrises.map((item) => (
            <CrisisCard
              key={item.sessionId}
              item={item}
              unmasked={unmaskedMap[item.sessionId]}
              editingNote={
                editingNotes[item.sessionId] !== undefined
                  ? editingNotes[item.sessionId]
                  : item.dispositionNote || ''
              }
              onNoteChange={(val) =>
                setEditingNotes((prev) => ({ ...prev, [item.sessionId]: val }))
              }
              onSaveNote={() => handleSaveNote(item.sessionId, item.dispositionStatus)}
              isSavingNote={Boolean(savingMap[item.sessionId])}
              isUpdatingStatus={Boolean(statusUpdating[item.sessionId])}
              savedFeedback={savedFeedback[item.sessionId]}
              onStatusChange={(status) => handleStatusChange(item.sessionId, status)}
              onUnmask={(c) => setSelectedCrisis(c)}
              onDelete={(s) => setDeletingCrisis(s)}
            />
          ))}
        </div>
      )}

      {selectedCrisis && (
        <CrisisUnmaskModal crisis={selectedCrisis} onClose={() => setSelectedCrisis(null)} />
      )}

      {deletingCrisis && (
        <SessionDeleteModal
          session={deletingCrisis}
          onClose={() => setDeletingCrisis(null)}
          onSuccess={() => {
            setDeletingCrisis(null);
            fetchCrises();
          }}
        />
      )}
    </div>
  );
};
