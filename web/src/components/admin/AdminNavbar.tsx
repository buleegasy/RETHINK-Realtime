import React from 'react';
import {
  ShieldAlert,
  Volume2,
  VolumeX,
  LogOut,
  SlidersHorizontal,
  LayoutDashboard,
  Archive,
  Monitor,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import { useModeStore } from '../../store/modeStore';

interface AdminNavbarProps {
  onOpenSettings: () => void;
}

export const AdminNavbar: React.FC<AdminNavbarProps> = ({ onOpenSettings }) => {
  const {
    activeTab,
    setActiveTab,
    crises,
    buzzerEnabled,
    setBuzzerEnabled,
    teacherProfile,
    logout,
  } = useAdminStore();

  const { setRunMode } = useModeStore();

  const activeCrisisCount = crises.filter(
    (c) => c.crisisLevel >= 3 && c.dispositionStatus !== 'closed'
  ).length;

  return (
    <header className="bg-[#ffffff] border-b border-[#e1e3e1] px-6 py-3.5 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <h1
              className="text-lg font-light tracking-[0.2em] uppercase text-black"
              style={{ fontFamily: "'Times New Roman', Georgia, serif" }}
            >
              RETHINK
            </h1>
            <span className="bg-[#f0f4f9] text-[#004a77] text-[10px] font-mono font-medium px-2 py-0.5 rounded-md">
              Console
            </span>
          </div>

          <nav className="hidden md:flex items-center bg-[#f0f4f9] p-1 rounded-full gap-1">
            <button
              onClick={() => setActiveTab('pulse')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeTab === 'pulse'
                  ? 'bg-[#ffffff] text-[#004a77] shadow-sm'
                  : 'text-[#444746] hover:bg-[#e1e3e1]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              情绪大盘
            </button>

            <button
              onClick={() => setActiveTab('crises')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-colors relative ${
                activeTab === 'crises'
                  ? 'bg-[#ffffff] text-[#ba1a1a] shadow-sm font-semibold'
                  : 'text-[#444746] hover:bg-[#e1e3e1]'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              危机中心
              {activeCrisisCount > 0 && (
                <span className="bg-[#ba1a1a] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {activeCrisisCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeTab === 'sessions'
                  ? 'bg-[#ffffff] text-[#004a77] shadow-sm'
                  : 'text-[#444746] hover:bg-[#e1e3e1]'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              个案档案
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setBuzzerEnabled(!buzzerEnabled)}
            title={buzzerEnabled ? '警报声音开启' : '警报声音静音'}
            className={`p-2 rounded-full border transition-colors ${
              buzzerEnabled
                ? 'bg-[#ffffff] border-[#c4c7c5] text-[#1f1f1f] hover:bg-[#f0f4f9]'
                : 'bg-[#feedc2] border-[#f59e0b] text-[#442c00]'
            }`}
          >
            {buzzerEnabled ? (
              <Volume2 className="w-4 h-4 text-[#146c2e]" />
            ) : (
              <VolumeX className="w-4 h-4 text-[#ba1a1a]" />
            )}
          </button>

          <button
            onClick={onOpenSettings}
            title="设置"
            className="p-2 rounded-full bg-[#ffffff] border border-[#c4c7c5] text-[#444746] hover:bg-[#f0f4f9] transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            onClick={() => setRunMode('kiosk')}
            title="终端模式"
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-[#ffffff] border border-[#c4c7c5] text-[#444746] hover:bg-[#f0f4f9] transition-colors"
          >
            <Monitor className="w-3.5 h-3.5 text-[#004a77]" />
            终端模式
          </button>

          <div className="h-4 w-px bg-[#c4c7c5] mx-1" />

          <div className="flex items-center gap-2 bg-[#ffffff] border border-[#c4c7c5] pl-3 pr-1.5 py-1 rounded-full">
            <span className="text-xs font-medium text-[#1f1f1f]">
              {teacherProfile?.displayName || '教师'}
            </span>
            <button
              onClick={logout}
              title="退出登录"
              className="p-1 rounded-full hover:bg-[#f0f4f9] text-[#747775] hover:text-[#ba1a1a] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
