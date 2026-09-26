import { create } from 'zustand';
import type { CBTStage, DialogueTurn, SanitizedCbtReport } from '../types';

export type HookState = 'idle' | 'connecting' | 'connected' | 'error' | 'hangup';
export type SessionStatus = 'idle' | 'active' | 'finished';
export type DuplexPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface BoothState {
  hookState: HookState;
  sessionStatus: SessionStatus;
  duplexPhase: DuplexPhase;
  cbtStage: CBTStage | string;
  isMuted: boolean;
  callDuration: number;
  audioLevel: number;
  activeTranscript: { user: string; assistant: string };
  dialogueHistory: DialogueTurn[];
  latestReport: SanitizedCbtReport | null;
  isReportModalOpen: boolean;
  isCrisisOverlayOpen: boolean;
  errorMessage: string | null;

  setHookState: (state: HookState) => void;
  setSessionStatus: (status: SessionStatus) => void;
  setDuplexPhase: (phase: DuplexPhase) => void;
  setCBTStage: (stage: CBTStage | string) => void;
  setIsMuted: (isMuted: boolean) => void;
  setAudioLevel: (level: number) => void;
  setActiveTranscript: (
    transcript:
      | { user?: string; assistant?: string }
      | ((prev: { user: string; assistant: string }) => { user: string; assistant: string })
  ) => void;
  addDialogueTurn: (turn: DialogueTurn) => void;
  setLatestReport: (report: SanitizedCbtReport | null) => void;
  setReportModalOpen: (open: boolean) => void;
  setCrisisOverlayOpen: (open: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setCallDuration: (duration: number | ((prev: number) => number)) => void;
  resetBooth: () => void;
}

const initialState = {
  hookState: 'idle' as HookState,
  sessionStatus: 'idle' as SessionStatus,
  duplexPhase: 'idle' as DuplexPhase,
  cbtStage: '剥离事实' as CBTStage | string,
  isMuted: false,
  callDuration: 0,
  audioLevel: 0,
  activeTranscript: { user: '', assistant: '' },
  dialogueHistory: [] as DialogueTurn[],
  latestReport: null as SanitizedCbtReport | null,
  isReportModalOpen: false,
  isCrisisOverlayOpen: false,
  errorMessage: null as string | null,
};

export const useBoothStore = create<BoothState>((set) => ({
  ...initialState,

  setHookState: (hookState) => set({ hookState }),
  setSessionStatus: (sessionStatus) => set({ sessionStatus }),
  setDuplexPhase: (duplexPhase) => set({ duplexPhase }),
  setCBTStage: (cbtStage) => set({ cbtStage }),
  setIsMuted: (isMuted) => set({ isMuted }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setActiveTranscript: (transcript) =>
    set((state) => ({
      activeTranscript:
        typeof transcript === 'function'
          ? transcript(state.activeTranscript)
          : { ...state.activeTranscript, ...transcript },
    })),
  addDialogueTurn: (turn) =>
    set((state) => ({
      dialogueHistory: [...state.dialogueHistory, turn],
    })),
  setLatestReport: (latestReport) => set({ latestReport }),
  setReportModalOpen: (isReportModalOpen) => set({ isReportModalOpen }),
  setCrisisOverlayOpen: (isCrisisOverlayOpen) => set({ isCrisisOverlayOpen }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setCallDuration: (duration) =>
    set((state) => ({
      callDuration: typeof duration === 'function' ? duration(state.callDuration) : duration,
    })),
  resetBooth: () => set(initialState),
}));
