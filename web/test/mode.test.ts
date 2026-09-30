import { describe, it, expect, beforeEach } from 'vitest';
import { useModeStore } from '../src/store/modeStore';
import { useAuthStore } from '../src/store/authStore';

describe('运行模式状态机测试 (Web Mode vs Kiosk Mode)', () => {
  beforeEach(() => {
    localStorage.clear();
    useModeStore.getState().setRunMode('web');
  });

  it('默认为个人网页端模式，支持切换为树莓派终端模式并存入 localStorage', () => {
    const store = useModeStore.getState();
    expect(store.runMode).toBe('web');

    store.setRunMode('kiosk');
    expect(useModeStore.getState().runMode).toBe('kiosk');
    expect(localStorage.getItem('rethink_run_mode')).toBe('kiosk');
  });

  it('更新终端设备配置并持久化设备号', () => {
    const store = useModeStore.getState();
    store.updateKioskConfig({
      deviceId: 'pi-custom-booth-99',
      locationName: '图书馆一楼大厅',
    });

    const updated = useModeStore.getState().kioskConfig;
    expect(updated.deviceId).toBe('pi-custom-booth-99');
    expect(updated.locationName).toBe('图书馆一楼大厅');
    expect(localStorage.getItem('rethink_kiosk_device')).toBe('pi-custom-booth-99');
  });

  it('网页端咨询历史记录的添加与查询', () => {
    const store = useModeStore.getState();
    expect(store.historyRecords.length).toBe(0);

    const mockReport = {
      sessionId: 'sess_1',
      generatedAt: Date.now(),
      durationSeconds: 120,
      userDisplayName: '小李',
      cbtStageReached: 'Active_Listening' as const,
      coreConcerns: ['学业焦虑'],
      cognitiveDistortions: ['灾难化思维'],
      emotionalTrajectory: { initial: '紧绷', final: '缓和', deltaNotes: '良好' },
      keyTakeaways: ['多休息'],
      isDeidentified: true,
    };

    store.addHistoryRecord({
      id: 'sess_1',
      date: Date.now(),
      duration: 120,
      stage: 'Active_Listening',
      report: mockReport,
    });

    const records = useModeStore.getState().historyRecords;
    expect(records.length).toBe(1);
    expect(records[0].id).toBe('sess_1');

    store.clearHistoryRecords();
    expect(useModeStore.getState().historyRecords.length).toBe(0);
  });

  it('终端模式下退出登录应清除持久化状态并回退至网页模式', () => {
    const modeStore = useModeStore.getState();
    const authStore = useAuthStore.getState();

    modeStore.setRunMode('kiosk');
    authStore.login(
      { id: 'kiosk-01', userName: 'kiosk-01', displayName: '咨询终端', role: 'student' },
      'test-token'
    );

    expect(useModeStore.getState().runMode).toBe('kiosk');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useModeStore.getState().runMode).toBe('web');
    expect(localStorage.getItem('rethink_run_mode')).toBeNull();
    expect(localStorage.getItem('rethink_auth_token')).toBeNull();
  });
});
