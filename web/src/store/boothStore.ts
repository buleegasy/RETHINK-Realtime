import { create } from 'zustand';
import type {
  BoothHookState,
  VoiceSessionStatus,
  DuplexPhase,
  CBTStage,
  DialogueTurn,
  SanitizedCbtReport,
} from '../types';

interface BoothState {

  hookState: BoothHookState;
  sessionStatus: VoiceSessionStatus;
  duplexPhase: DuplexPhase;
  cbtStage: CBTStage;
  dialDigits: string;
  callDuration: number;
  isMuted: boolean;
  audioLevel: number;
  errorMessage: string | null;

  activeTranscript: { user: string; assistant: string };
  dialogueHistory: DialogueTurn[];

  latestReport: SanitizedCbtReport | null;
  isReportModalOpen: boolean;
  isCrisisOverlayOpen: boolean;

  setHookState: (hookState: BoothHookState) => void;
  setSessionStatus: (status: VoiceSessionStatus) => void;
  setDuplexPhase: (phase: DuplexPhase) => void;
  setCBTStage: (stage: CBTStage) => void;
  appendDialDigit: (digit: string) => void;
  clearDialDigits: () => void;
  setCallDuration: (duration: number | ((prev: number) => number)) => void;
  setIsMuted: (isMuted: boolean) => void;
  setAudioLevel: (level: number) => void;
  setActiveTranscript: (transcript: { user: string; assistant: string }) => void;
  addDialogueTurn: (turn: DialogueTurn) => void;
  setDialogueHistory: (turns: DialogueTurn[]) => void;
  setLatestReport: (report: SanitizedCbtReport | null) => void;
  setReportModalOpen: (open: boolean) => void;
  setCrisisOverlayOpen: (open: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  resetBooth: () => void;
}

export const useBoothStore = create<BoothState>((set) => ({
  hookState: 'on_hook',
  sessionStatus: 'idle',
  duplexPhase: 'idle',
  cbtStage: 'Active_Listening',
  dialDigits: '',
  callDuration: 0,
  isMuted: false,
  audioLevel: 0,
  errorMessage: null,

  activeTranscript: { user: '', assistant: '' },
  dialogueHistory: [],

  latestReport: null,
  isReportModalOpen: false,
  isCrisisOverlayOpen: false,

  setHookState: (hookState) => set({ hookState }),
  setSessionStatus: (sessionStatus) => set({ sessionStatus }),
  setDuplexPhase: (duplexPhase) => set({ duplexPhase }),
  setCBTStage: (cbtStage) => set({ cbtStage }),
  appendDialDigit: (digit) =>
    set((state) => ({ dialDigits: (state.dialDigits + digit).slice(-12) })),
  clearDialDigits: () => set({ dialDigits: '' }),
  setCallDuration: (duration) =>
    set((state) => ({
      callDuration: typeof duration === 'function' ? duration(state.callDuration) : duration,
    })),
  setIsMuted: (isMuted) => set({ isMuted }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setActiveTranscript: (activeTranscript) => set({ activeTranscript }),
  addDialogueTurn: (turn) =>
    set((state) => ({ dialogueHistory: [...state.dialogueHistory, turn] })),
  setDialogueHistory: (dialogueHistory) => set({ dialogueHistory }),
  setLatestReport: (latestReport) => set({ latestReport }),
  setReportModalOpen: (isReportModalOpen) => set({ isReportModalOpen }),
  setCrisisOverlayOpen: (isCrisisOverlayOpen) => set({ isCrisisOverlayOpen }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),

  resetBooth: () =>
    set({
      hookState: 'on_hook',
      sessionStatus: 'idle',
      duplexPhase: 'idle',
      cbtStage: 'Active_Listening',
      dialDigits: '',
      callDuration: 0,
      isMuted: false,
      audioLevel: 0,
      errorMessage: null,
      activeTranscript: { user: '', assistant: '' },
    }),
}));
