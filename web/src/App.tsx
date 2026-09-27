import React, { Suspense, lazy } from 'react';
import { VoiceView } from './components/voice/VoiceView';
import { LoginWall } from './components/auth/LoginWall';
import { useAuthStore } from './store/authStore';
import { useModeStore } from './store/modeStore';
import { useVoiceSession } from './hooks/useVoiceSession';

const AdminPortal = lazy(() =>
  import('./components/admin/AdminPortal').then((m) => ({ default: m.AdminPortal }))
);

export function App() {
  const runMode = useModeStore((s) => s.runMode);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { startCall, endCall, interrupt } = useVoiceSession();

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-white text-black font-sans overflow-hidden">
      {runMode === 'admin' ? (
        <Suspense
          fallback={
            <div className="flex h-screen w-screen items-center justify-center bg-[#f8f9fa] text-[#444746] text-xs">
              <div className="flex flex-col items-center gap-3">
                <div className="w-7 h-7 border-2 border-[#004a77] border-t-transparent rounded-full animate-spin" />
                <span>正在加载教师管理工作台...</span>
              </div>
            </div>
          }
        >
          <AdminPortal />
        </Suspense>
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
