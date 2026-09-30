import React, { Suspense, lazy, useEffect } from 'react';
import { VoiceView } from './components/voice/VoiceView';
import { LoginWall } from './components/auth/LoginWall';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useAuthStore } from './store/authStore';
import { useModeStore } from './store/modeStore';
import { useVoiceSession } from './hooks/useVoiceSession';
import { apiFetch } from './lib/api';

const AdminPortal = lazy(() =>
  import('./components/admin/AdminPortal').then((m) => ({ default: m.AdminPortal }))
);

export function App() {
  const runMode = useModeStore((s) => s.runMode);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);

  const { startCall, endCall, interrupt } = useVoiceSession();

  useEffect(() => {
    if (runMode === 'kiosk' && !isAuthenticated) {
      apiFetch('/api/auth/kiosk-login', {
        method: 'POST',
        body: JSON.stringify({ deviceId: 'kiosk-booth-01' }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user && data.token) {
            login(data.user, data.token);
          }
        })
        .catch((err) => {
          console.warn('[App] Kiosk 终端自动免密鉴权异常:', err);
        });
    }
  }, [runMode, isAuthenticated, login]);

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-white text-black font-sans overflow-hidden">
      {runMode === 'admin' ? (
        <ErrorBoundary fallbackTitle="教师管理工作台载入遇到异常">
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
        </ErrorBoundary>
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
