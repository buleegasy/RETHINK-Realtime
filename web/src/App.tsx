import React from 'react';
import { VoiceView } from './components/voice/VoiceView';
import { LoginWall } from './components/auth/LoginWall';
import { AdminPortal } from './components/admin/AdminPortal';
import { useAuthStore } from './store/authStore';
import { useModeStore } from './store/modeStore';
import { useVoiceSession } from './hooks/useVoiceSession';

export function App() {
  const runMode = useModeStore((s) => s.runMode);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { startCall, endCall, interrupt } = useVoiceSession();

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-white text-black font-sans overflow-hidden">
      {runMode === 'admin' ? (
        <AdminPortal />
      ) : !isAuthenticated ? (
        <LoginWall />
      ) : (
        <VoiceView
          onStartCall={startCall}
          onEndCall={endCall}
          onInterrupt={interrupt}
        />
      )}
    </div>
  );
}

export default App;
