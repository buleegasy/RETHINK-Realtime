import { create } from 'zustand';
import type {
  AdminStats,
  AdminCrisisItem,
  AdminSessionItem,
  UnmaskedIdentity,
  CrisisAuditLog,
  DispositionStatus,
  UserProfile,
} from '../types';
import { apiFetch } from '../lib/api';

interface AdminState {
  isAuthenticated: boolean;
  token: string | null;
  teacherProfile: UserProfile | null;
  activeTab: 'pulse' | 'crises' | 'sessions' | 'settings';
  stats: AdminStats | null;
  crises: AdminCrisisItem[];
  sessions: AdminSessionItem[];
  showArchived: boolean;
  unmaskedMap: Record<string, UnmaskedIdentity>;
  auditLogs: CrisisAuditLog[];
  buzzerEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  selectedSession: AdminSessionItem | null;

  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  fetchStats: () => Promise<void>;
  fetchCrises: () => Promise<void>;
  fetchSessions: (crisisOnly?: boolean, includeDeleted?: boolean) => Promise<void>;
  fetchAuditLogs: () => Promise<void>;
  unmaskCrisis: (sessionId: string, passcode: string, operatorName?: string) => Promise<{ success: boolean; identity?: UnmaskedIdentity; error?: string }>;
  updateDisposition: (sessionId: string, status: DispositionStatus, note?: string) => Promise<boolean>;
  deleteSession: (sessionId: string, passcode: string, reason: string, operatorName?: string) => Promise<{ success: boolean; error?: string }>;
  restoreSession: (sessionId: string, passcode: string, operatorName?: string) => Promise<{ success: boolean; error?: string }>;
  reEvaluateSession: (sessionId: string) => Promise<{ success: boolean; report?: any; error?: string }>;
  setShowArchived: (show: boolean) => void;
  setBuzzerEnabled: (enabled: boolean) => void;
  playBuzzer: () => void;
  setActiveTab: (tab: 'pulse' | 'crises' | 'sessions' | 'settings') => void;
  setSelectedSession: (session: AdminSessionItem | null) => void;
}

const STORAGE_KEY = 'rethink_teacher_auth';

function getStoredAuth(): { token: string | null; user: UserProfile | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { token: null, user: null };
}

export const useAdminStore = create<AdminState>((set, get) => {
  const initial = getStoredAuth();

  return {
    isAuthenticated: Boolean(initial.token),
    token: initial.token,
    teacherProfile: initial.user,
    activeTab: 'pulse',
    stats: null,
    crises: [],
    sessions: [],
    showArchived: false,
    unmaskedMap: {},
    auditLogs: [],
    buzzerEnabled: true,
    isLoading: false,
    error: null,
    selectedSession: null,

    login: async (username: string, password: string) => {
      set({ isLoading: true, error: null });
      try {
        const res = await apiFetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (data.success && data.token) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token, user: data.user }));
          set({
            isAuthenticated: true,
            token: data.token,
            teacherProfile: data.user,
            isLoading: false,
          });
          await get().fetchStats();
          await get().fetchCrises();
          return true;
        } else {
          set({ isLoading: false, error: data.error || '登录失败' });
          return false;
        }
      } catch (e: any) {
        set({ isLoading: false, error: e?.message || '网络连接失败' });
        return false;
      }
    },

    logout: () => {
      localStorage.removeItem(STORAGE_KEY);
      set({
        isAuthenticated: false,
        token: null,
        teacherProfile: null,
        stats: null,
        crises: [],
        sessions: [],
        showArchived: false,
        unmaskedMap: {},
        auditLogs: [],
        selectedSession: null,
      });
    },

    fetchStats: async () => {
      try {
        const res = await apiFetch('/api/admin/stats');
        const data = await res.json();
        if (data.success && data.stats) {
          set({ stats: data.stats });
        }
      } catch {}
    },

    fetchCrises: async () => {
      try {
        const res = await apiFetch('/api/admin/crises');
        const data = await res.json();
        const backendCrises: AdminCrisisItem[] = (data.success && Array.isArray(data.crises)) ? data.crises : [];

        let localSessions: AdminSessionItem[] = [];
        try {
          const raw = localStorage.getItem('rethink_real_sessions');
          if (raw) {
            localSessions = JSON.parse(raw);
          }
        } catch {}

        const crisisMap = new Map<string, AdminCrisisItem>();
        for (const c of backendCrises) {
          if (!c.sessionId?.startsWith('sess_sample_') && !c.sessionId?.startsWith('mock_')) {
            crisisMap.set(c.sessionId, c);
          }
        }

        for (const s of localSessions) {
          if ((s.isCrisis || s.crisisLevel >= 3) && !s.isDeleted && !s.sessionId?.startsWith('sess_sample_') && !s.sessionId?.startsWith('mock_')) {
            if (!crisisMap.has(s.sessionId)) {
              crisisMap.set(s.sessionId, {
                sessionId: s.sessionId,
                duration: s.duration,
                crisisLevel: s.crisisLevel,
                crisisSummary: s.crisisSummary,
                coreConcerns: s.coreConcerns,
                emotionalValence: s.emotionalValence,
                dispositionStatus: s.dispositionStatus || 'pending_contact',
                dispositionNote: s.dispositionNote || '',
                createdAt: s.createdAt,
                hasEncryptedIdentity: s.hasEncryptedIdentity,
              });
            } else {
              const remote = crisisMap.get(s.sessionId)!;
              if (s.dispositionStatus && s.dispositionStatus !== 'pending_contact' && remote.dispositionStatus === 'pending_contact') {
                crisisMap.set(s.sessionId, {
                  ...remote,
                  dispositionStatus: s.dispositionStatus,
                  dispositionNote: s.dispositionNote || remote.dispositionNote,
                });
              }
            }
          }
        }

        const combinedCrises = Array.from(crisisMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const currentCount = get().crises.length;
        set({ crises: combinedCrises });
        if (combinedCrises.length > currentCount && get().buzzerEnabled) {
          get().playBuzzer();
        }
      } catch {}
    },

    fetchSessions: async (crisisOnly = false, includeDeleted?: boolean) => {
      set({ isLoading: true });
      try {
        const incDel = includeDeleted ?? get().showArchived;
        const res = await apiFetch(`/api/admin/sessions?crisisOnly=${crisisOnly ? 'true' : 'false'}&includeDeleted=${incDel ? 'true' : 'false'}`);
        const data = await res.json();
        const backendSessions: AdminSessionItem[] = (data.success && Array.isArray(data.sessions)) ? data.sessions : [];

        let localSessions: AdminSessionItem[] = [];
        try {
          const raw = localStorage.getItem('rethink_real_sessions');
          if (raw) {
            localSessions = JSON.parse(raw);
          }
        } catch {}

        const sessionMap = new Map<string, AdminSessionItem>();
        for (const s of backendSessions) {
          if (!s.sessionId?.startsWith('sess_sample_') && !s.sessionId?.startsWith('mock_')) {
            sessionMap.set(s.sessionId, s);
          }
        }
        for (const s of localSessions) {
          if (!s.sessionId?.startsWith('sess_sample_') && !s.sessionId?.startsWith('mock_')) {
            if (!sessionMap.has(s.sessionId)) {
              sessionMap.set(s.sessionId, s);
            } else {
              const remote = sessionMap.get(s.sessionId)!;
              if (s.dispositionStatus && s.dispositionStatus !== 'pending_contact' && remote.dispositionStatus === 'pending_contact') {
                sessionMap.set(s.sessionId, {
                  ...remote,
                  dispositionStatus: s.dispositionStatus,
                  dispositionNote: s.dispositionNote || remote.dispositionNote,
                });
              }
            }
          }
        }

        let combined = Array.from(sessionMap.values());
        if (!incDel) {
          combined = combined.filter((s) => !s.isDeleted);
        }
        if (crisisOnly) {
          combined = combined.filter((s) => s.isCrisis || (s.crisisLevel >= 3));
        }
        combined.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        set({ sessions: combined, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    },

    fetchAuditLogs: async () => {
      try {
        const res = await apiFetch('/api/admin/audit-logs');
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          set({ auditLogs: data.logs });
        }
      } catch {}
    },

    unmaskCrisis: async (sessionId: string, passcode: string, operatorName?: string) => {
      try {
        const op = operatorName || get().teacherProfile?.displayName || '心理专职教师';
        const res = await apiFetch('/api/admin/crisis/unmask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            secondary_passcode: passcode,
            operator_name: op,
          }),
        });
        const data = await res.json();
        if (data.success && data.realIdentity) {
          set((state) => ({
            unmaskedMap: {
              ...state.unmaskedMap,
              [sessionId]: data.realIdentity,
            },
          }));
          await get().fetchAuditLogs();
          return { success: true, identity: data.realIdentity };
        } else {
          return { success: false, error: data.error || '二次安全口令校验未通过' };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || '网络异常' };
      }
    },

    updateDisposition: async (sessionId: string, status: DispositionStatus, note?: string) => {
      const currentCrisis = get().crises.find((c) => c.sessionId === sessionId);
      const currentSession = get().sessions.find((s) => s.sessionId === sessionId);
      const finalNote = note !== undefined ? note : (currentCrisis?.dispositionNote || currentSession?.dispositionNote || '');

      set((state) => ({
        crises: state.crises.map((c) =>
          c.sessionId === sessionId
            ? { ...c, dispositionStatus: status, dispositionNote: finalNote }
            : c
        ),
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId
            ? { ...s, dispositionStatus: status, dispositionNote: finalNote }
            : s
        ),
      }));

      try {
        const raw = localStorage.getItem('rethink_real_sessions');
        if (raw) {
          const list: AdminSessionItem[] = JSON.parse(raw);
          const updated = list.map((s) =>
            s.sessionId === sessionId
              ? { ...s, dispositionStatus: status, dispositionNote: finalNote }
              : s
          );
          localStorage.setItem('rethink_real_sessions', JSON.stringify(updated));
        }
      } catch {}

      try {
        const res = await apiFetch('/api/admin/crisis/disposition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            status,
            note: finalNote,
          }),
        });
        const data = await res.json();
        return Boolean(data.success);
      } catch {
        return false;
      }
    },

    refreshAdminData: async () => {
      await get().fetchSessions(false, get().showArchived);
      await get().fetchCrises();
      await get().fetchStats();
      await get().fetchAuditLogs();
    },

    deleteSession: async (sessionId: string, passcode: string, reason: string, operatorName?: string) => {
      try {
        const op = operatorName || get().teacherProfile?.displayName || '心理专职教师';
        const res = await apiFetch('/api/admin/sessions/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            secondary_passcode: passcode,
            reason,
            operator_name: op,
          }),
        });
        const data = await res.json();
        if (data.success) {
          try {
            const raw = localStorage.getItem('rethink_real_sessions');
            if (raw) {
              const list: AdminSessionItem[] = JSON.parse(raw);
              const updated = list.map((s) => s.sessionId === sessionId ? { ...s, isDeleted: true, deleteReason: reason, deletedBy: op, deletedAt: Math.floor(Date.now() / 1000) } : s);
              localStorage.setItem('rethink_real_sessions', JSON.stringify(updated));
            }
          } catch {}
          await get().refreshAdminData();
          return { success: true };
        }
        return { success: false, error: data.error || '删除验证失败' };
      } catch (err: any) {
        return { success: false, error: err?.message || '网络异常' };
      }
    },

    restoreSession: async (sessionId: string, passcode: string, operatorName?: string) => {
      try {
        const op = operatorName || get().teacherProfile?.displayName || '心理专职教师';
        const res = await apiFetch('/api/admin/sessions/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            secondary_passcode: passcode,
            operator_name: op,
          }),
        });
        const data = await res.json();
        if (data.success) {
          try {
            const raw = localStorage.getItem('rethink_real_sessions');
            if (raw) {
              const list: AdminSessionItem[] = JSON.parse(raw);
              const updated = list.map((s) => s.sessionId === sessionId ? { ...s, isDeleted: false, deleteReason: null, deletedBy: null, deletedAt: null } : s);
              localStorage.setItem('rethink_real_sessions', JSON.stringify(updated));
            }
          } catch {}
          await get().refreshAdminData();
          return { success: true };
        }
        return { success: false, error: data.error || '恢复操作失败' };
      } catch (err: any) {
        return { success: false, error: err?.message || '网络异常' };
      }
    },

    reEvaluateSession: async (sessionId: string) => {
      try {
        const res = await apiFetch('/api/admin/sessions/re-evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json();
        if (data.success && data.report) {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.sessionId === sessionId
                ? {
                    ...s,
                    deidentifiedReport: data.report,
                    crisisLevel: data.session?.crisisLevel ?? s.crisisLevel,
                    crisisSummary: data.session?.crisisSummary ?? s.crisisSummary,
                    coreConcerns: data.session?.coreConcerns ?? s.coreConcerns,
                    emotionalValence: data.session?.emotionalValence ?? s.emotionalValence,
                  }
                : s
            ),
          }));
          try {
            const raw = localStorage.getItem('rethink_real_sessions');
            if (raw) {
              const list: AdminSessionItem[] = JSON.parse(raw);
              const updated = list.map((s) =>
                s.sessionId === sessionId
                  ? {
                      ...s,
                      deidentifiedReport: data.report,
                      crisisLevel: data.session?.crisisLevel ?? s.crisisLevel,
                      crisisSummary: data.session?.crisisSummary ?? s.crisisSummary,
                      coreConcerns: data.session?.coreConcerns ?? s.coreConcerns,
                      emotionalValence: data.session?.emotionalValence ?? s.emotionalValence,
                    }
                  : s
              );
              localStorage.setItem('rethink_real_sessions', JSON.stringify(updated));
            }
          } catch {}
          return { success: true, report: data.report };
        }
        return { success: false, error: data.error || '重新解析失败' };
      } catch (err: any) {
        return { success: false, error: err?.message || '网络异常' };
      }
    },

    setShowArchived: (show: boolean) => {
      set({ showArchived: show });
      get().fetchSessions(false, show);
    },

    setBuzzerEnabled: (enabled: boolean) => {
      set({ buzzerEnabled: enabled });
    },

    playBuzzer: () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } catch {}
    },

    setActiveTab: (tab) => set({ activeTab: tab }),
    setSelectedSession: (session) => set({ selectedSession: session }),
  };
});
