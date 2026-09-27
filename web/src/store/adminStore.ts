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
import { AdminApiClient } from '../lib/api/adminApiClient';

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
  reEvaluateSession: (sessionId: string, transcript?: string) => Promise<{ success: boolean; report?: any; session?: any; error?: string }>;
  refreshAdminData: () => Promise<void>;
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
        const data = await AdminApiClient.login(username, password);
        if (data.success && data.token) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token, user: data.user }));
          set({
            isAuthenticated: true,
            token: data.token,
            teacherProfile: data.user || null,
            isLoading: false,
          });
          await get().fetchStats();
          await get().fetchCrises();
          return true;
        }
        set({ isLoading: false, error: data.error || '登录失败' });
        return false;
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
      const stats = await AdminApiClient.fetchStats();
      if (stats) set({ stats });
    },

    fetchCrises: async () => {
      const combinedCrises = await AdminApiClient.fetchCrises();
      const currentCount = get().crises.length;
      set({ crises: combinedCrises });
      if (combinedCrises.length > currentCount && get().buzzerEnabled) {
        get().playBuzzer();
      }
    },

    fetchSessions: async (crisisOnly = false, includeDeleted?: boolean) => {
      set({ isLoading: true });
      const incDel = includeDeleted ?? get().showArchived;
      const combined = await AdminApiClient.fetchSessions(crisisOnly, incDel);
      set({ sessions: combined, isLoading: false });
    },

    fetchAuditLogs: async () => {
      const logs = await AdminApiClient.fetchAuditLogs();
      set({ auditLogs: logs });
    },

    unmaskCrisis: async (sessionId: string, passcode: string, operatorName?: string) => {
      try {
        const op = operatorName || get().teacherProfile?.displayName || '心理专职教师';
        const data = await AdminApiClient.unmaskCrisis(sessionId, passcode, op);
        if (data.success && data.realIdentity) {
          set((state) => ({
            unmaskedMap: {
              ...state.unmaskedMap,
              [sessionId]: data.realIdentity!,
            },
          }));
          await get().fetchAuditLogs();
          return { success: true, identity: data.realIdentity };
        }
        return { success: false, error: data.error || '二次安全口令校验未通过' };
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

      return AdminApiClient.updateDisposition(sessionId, status, finalNote);
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
        const data = await AdminApiClient.deleteSession(sessionId, passcode, reason, op);
        if (data.success) {
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
        const data = await AdminApiClient.restoreSession(sessionId, passcode, op);
        if (data.success) {
          await get().refreshAdminData();
          return { success: true };
        }
        return { success: false, error: data.error || '恢复操作失败' };
      } catch (err: any) {
        return { success: false, error: err?.message || '网络异常' };
      }
    },

    reEvaluateSession: async (sessionId: string, transcript?: string) => {
      try {
        const data = await AdminApiClient.reEvaluateSession(sessionId, transcript);
        if (data.success && data.report) {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.sessionId === sessionId
                ? {
                    ...s,
                    deidentifiedReport: data.report,
                    crisisLevel: data.session?.crisisLevel ?? s.crisisLevel,
                    isCrisis: data.session?.isCrisis ?? (data.session?.crisisLevel >= 3 || s.isCrisis),
                    crisisSummary: data.session?.crisisSummary ?? s.crisisSummary,
                    coreConcerns: data.session?.coreConcerns ?? s.coreConcerns,
                    emotionalValence: data.session?.emotionalValence ?? s.emotionalValence,
                  }
                : s
            ),
          }));
          return { success: true, report: data.report, session: data.session };
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
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return;
        const ctx = new AudioCtxClass();
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
