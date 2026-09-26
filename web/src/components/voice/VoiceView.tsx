import React from 'react';
import { LogOut } from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';
import { CrisisOverlay } from '../common/CrisisOverlay';
import { CallReportModal } from '../report/CallReportModal';
import { useAuthStore } from '../../store/authStore';
import { useBoothStore } from '../../store/boothStore';

interface VoiceViewProps {
  onStartCall: () => void;
  onEndCall: () => void;
  onInterrupt: () => void;
}

export const VoiceView: React.FC<VoiceViewProps> = ({
  onStartCall,
  onEndCall,
}) => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const sessionStatus = useBoothStore((s) => s.sessionStatus);
  const duplexPhase = useBoothStore((s) => s.duplexPhase);
  const audioLevel = useBoothStore((s) => s.audioLevel);
  const callDuration = useBoothStore((s) => s.callDuration);
  const cbtStage = useBoothStore((s) => s.cbtStage);

  const isActive = sessionStatus === 'connected' || sessionStatus === 'connecting';

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-full flex flex-col justify-between bg-white text-black select-none">
      <header className="w-full flex items-center justify-between px-6 py-4 border-b border-black/10">
        <h1
          className="text-xl tracking-[0.25em] uppercase font-light text-black"
          style={{ fontFamily: "'Times New Roman', Georgia, serif" }}
        >
          RETHINK
        </h1>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-black/60">{user?.displayName || user?.userName}</span>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1 text-black/50 hover:text-black transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <VoiceOrb
          status={sessionStatus}
          duplexPhase={duplexPhase}
          audioLevel={audioLevel}
          fsmState={cbtStage}
          onClick={isActive ? onEndCall : onStartCall}
        />
      </main>

      <footer className="w-full flex items-center justify-center pb-12 pt-4 px-6">
        {!isActive ? (
          <button
            type="button"
            onClick={onStartCall}
            className="px-8 py-3.5 rounded-full bg-black text-white text-sm font-medium tracking-wider hover:bg-neutral-800 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            开始倾诉
          </button>
        ) : (
          <button
            type="button"
            onClick={onEndCall}
            className="px-8 py-3.5 rounded-full bg-neutral-900 text-white text-sm font-medium tracking-wider hover:bg-black active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>结束通话</span>
            <span className="font-mono text-xs opacity-75">{formatDuration(callDuration)}</span>
          </button>
        )}
      </footer>

      <CrisisOverlay />
      <CallReportModal />
    </div>
  );
};
