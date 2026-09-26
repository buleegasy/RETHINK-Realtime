import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertCircle,
  Eye,
  CheckCircle2,
  Clock,
  MapPin,
  Sparkles,
  Save,
  Trash2,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import type { AdminCrisisItem, AdminSessionItem, DispositionStatus } from '../../types';
import { CrisisUnmaskModal } from './CrisisUnmaskModal';
import { SessionDeleteModal } from './SessionDeleteModal';

export const CrisisResponseCenter: React.FC = () => {
  const { crises, unmaskedMap, updateDisposition, fetchCrises } = useAdminStore();
  const [selectedCrisis, setSelectedCrisis] = useState<AdminCrisisItem | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [deletingCrisis, setDeletingCrisis] = useState<AdminSessionItem | null>(null);

  const handleStatusChange = async (sessionId: string, status: DispositionStatus) => {
    const note = editingNotes[sessionId];
    await updateDisposition(sessionId, status, note);
    await fetchCrises();
  };

  const handleSaveNote = async (sessionId: string, currentStatus: DispositionStatus) => {
    setSavingMap((prev) => ({ ...prev, [sessionId]: true }));
    const note = editingNotes[sessionId];
    await updateDisposition(sessionId, currentStatus, note);
    setSavingMap((prev) => ({ ...prev, [sessionId]: false }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#ffffff] border border-[#e1e3e1] p-6 rounded-3xl">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[#1f1f1f] tracking-tight">
            危机响应中心
          </h2>
          <p className="text-xs text-[#747775]">
            实时危机监控 · 双重口令穿透 · 全生命周期闭环
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-[#fce8e6] px-4 py-2 rounded-2xl border border-[#f2b8b5] text-center">
            <span className="text-[11px] font-medium text-[#601410] block">
              待介入
            </span>
            <span className="text-base font-bold text-[#ba1a1a]">
              {crises.filter((c) => c.dispositionStatus === 'pending_contact').length} 起
            </span>
          </div>

          <div className="bg-[#f0fdf4] px-4 py-2 rounded-2xl border border-[#bbf7d0] text-center">
            <span className="text-[11px] font-medium text-[#166534] block">
              已介入/已结案
            </span>
            <span className="text-base font-bold text-[#15803d]">
              {crises.filter((c) => c.dispositionStatus !== 'pending_contact').length} 起
            </span>
          </div>
        </div>
      </div>

      {crises.length === 0 ? (
        <div className="bg-[#ffffff] border border-[#c4eed0] rounded-3xl p-12 text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-[#e8f5e9] text-[#146c2e] flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-semibold text-[#1f1f1f]">
            当前无未结案危机事件
          </h3>
          <p className="text-xs text-[#747775]">
            管理后台已启用实时监听与脱敏穿透机制，一旦电话亭监测到极端风险意向将在此即刻告警。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {crises.map((item) => {
            const unmasked = unmaskedMap[item.sessionId];
            const currentNote =
              editingNotes[item.sessionId] !== undefined
                ? editingNotes[item.sessionId]
                : item.dispositionNote || '';

            return (
              <div
                key={item.sessionId}
                className={`bg-[#ffffff] rounded-3xl p-6 border transition-all ${
                  item.dispositionStatus === 'pending_contact'
                    ? 'border-[#ba1a1a] shadow-sm'
                    : 'border-[#c4c7c5]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-[#fce8e6] text-[#ba1a1a] flex items-center justify-center shrink-0 font-bold">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-[#ba1a1a] text-white text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                          极高危预警 (Level {item.crisisLevel})
                        </span>
                        <span className="text-xs font-mono text-[#5e5e5e] bg-[#f0f4f9] px-2 py-0.5 rounded-full">
                          {item.sessionId}
                        </span>
                        <span className="text-xs text-[#5e5e5e] flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(item.createdAt * 1000).toLocaleString('zh-CN')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-[#444746] mt-2">
                        <MapPin className="w-3.5 h-3.5 text-[#004a77]" />
                        <span>终端 #01 · 时长: {Math.floor(item.duration / 60)}分{item.duration % 60}秒</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex bg-[#f0f4f9] p-1 rounded-full text-xs font-medium border border-[#c4c7c5]">
                      <button
                        onClick={() => handleStatusChange(item.sessionId, 'pending_contact')}
                        className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                          item.dispositionStatus === 'pending_contact'
                            ? 'bg-[#ba1a1a] text-white font-semibold'
                            : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
                        }`}
                      >
                        待跟进
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.sessionId, 'intervened')}
                        className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                          item.dispositionStatus === 'intervened'
                            ? 'bg-[#004a77] text-white font-semibold'
                            : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
                        }`}
                      >
                        已介入
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.sessionId, 'closed')}
                        className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                          item.dispositionStatus === 'closed'
                            ? 'bg-[#146c2e] text-white font-semibold'
                            : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
                        }`}
                      >
                        已结案
                      </button>
                    </div>

                    <button
                      onClick={() =>
                        setDeletingCrisis({
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
                        })
                      }
                      title="安全归档此危机记录"
                      className="p-2 rounded-full border border-[#f2b8b5] text-[#ba1a1a] hover:bg-[#fce8e6] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="bg-[#fce8e6]/40 border border-[#f2b8b5] rounded-2xl p-4 mb-4">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-[#ba1a1a] shrink-0 mt-0.5" />
                    <div className="text-xs text-[#410e0b]">
                      <span className="font-bold">判定摘要：</span>
                      {item.crisisSummary}
                    </div>
                  </div>
                </div>

                <div className="bg-[#f8f9fa] border border-[#e1e3e1] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-[#747775] block uppercase tracking-wider">
                      身份信息
                    </span>
                    {!unmasked ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#1f1f1f]">
                          来访学生 #S{item.sessionId.slice(-4)}
                        </span>
                        <span className="bg-[#fee2e2] text-[#991b1b] text-[11px] px-2 py-0.5 rounded-full font-medium">
                          脱敏保护中
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-base font-bold text-[#166534]">
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

                  <div>
                    {!unmasked ? (
                      <button
                        onClick={() => setSelectedCrisis(item)}
                        className="px-5 py-2.5 rounded-full text-xs font-semibold bg-[#ba1a1a] text-white hover:bg-[#93000a] transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        查看学生身份
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedCrisis(item)}
                        className="px-4 py-2 rounded-full text-xs font-medium bg-[#ffffff] border border-[#c4c7c5] text-[#004a77] hover:bg-[#f0f4f9] transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        查看详情
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentNote}
                      onChange={(e) =>
                        setEditingNotes((prev) => ({ ...prev, [item.sessionId]: e.target.value }))
                      }
                      placeholder="处置记录与跟进说明..."
                      className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77]"
                    />
                    <button
                      onClick={() => handleSaveNote(item.sessionId, item.dispositionStatus)}
                      disabled={savingMap[item.sessionId]}
                      className="px-4 py-2 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingMap[item.sessionId] ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedCrisis && (
        <CrisisUnmaskModal
          crisis={selectedCrisis}
          onClose={() => setSelectedCrisis(null)}
        />
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
