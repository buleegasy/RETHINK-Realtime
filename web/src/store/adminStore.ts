import { create } from 'zustand';
import type {
  AdminStats,
  AdminCrisisItem,
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
  sessions: any[];
  unmaskedMap: Record<string, UnmaskedIdentity>;
  auditLogs: CrisisAuditLog[];
  buzzerEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  selectedSession: any | null;

  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  fetchStats: () => Promise<void>;
  fetchCrises: () => Promise<void>;
  fetchSessions: (crisisOnly?: boolean) => Promise<void>;
  fetchAuditLogs: () => Promise<void>;
  unmaskCrisis: (sessionId: string, passcode: string, operatorName?: string) => Promise<{ success: boolean; identity?: UnmaskedIdentity; error?: string }>;
  updateDisposition: (sessionId: string, status: DispositionStatus, note?: string) => Promise<boolean>;
  setBuzzerEnabled: (enabled: boolean) => void;
  playBuzzer: () => void;
  setActiveTab: (tab: 'pulse' | 'crises' | 'sessions' | 'settings') => void;
  setSelectedSession: (session: any | null) => void;
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
        if (data.success && Array.isArray(data.crises)) {
          const currentCount = get().crises.length;
          set({ crises: data.crises });
          if (data.crises.length > currentCount && get().buzzerEnabled) {
            get().playBuzzer();
          }
        }
      } catch {}
    },

    fetchSessions: async (crisisOnly = false) => {
      set({ isLoading: true });
      try {
        const res = await apiFetch(`/api/admin/sessions?crisisOnly=${crisisOnly ? 'true' : 'false'}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) {
          set({ sessions: data.sessions, isLoading: false });
        } else {
          set({ isLoading: false });
        }
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
      try {
        const res = await apiFetch('/api/admin/crisis/disposition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            status,
            note: note || '',
          }),
        });
        const data = await res.json();
        if (data.success) {
          set((state) => ({
            crises: state.crises.map((c) =>
              c.sessionId === sessionId
                ? { ...c, dispositionStatus: status, dispositionNote: note || c.dispositionNote }
                : c
            ),
            sessions: state.sessions.map((s) =>
              s.sessionId === sessionId
                ? { ...s, dispositionStatus: status, dispositionNote: note || s.dispositionNote }
                : s
            ),
          }));
          return true;
        }
        return false;
      } catch {
        return false;
      }
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
