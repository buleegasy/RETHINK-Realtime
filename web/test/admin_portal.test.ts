import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAdminStore } from '../src/store/adminStore';
import { useModeStore } from '../src/store/modeStore';

describe('心理老师管理后台与危机穿透状态机测试', () => {
  beforeEach(() => {
    localStorage.clear();
    useAdminStore.getState().logout();
    vi.restoreAllMocks();
  });

  it('初始未登录态，支持教师账号登录并持久化 Token', async () => {
    const store = useAdminStore.getState();
    expect(store.isAuthenticated).toBe(false);

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/login')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              token: 'test_token_123',
              user: { displayName: '王老师', role: 'teacher' },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    const ok = await useAdminStore.getState().login('teacher', 'counselor2026');
    expect(ok).toBe(true);
    expect(useAdminStore.getState().isAuthenticated).toBe(true);
    expect(useAdminStore.getState().teacherProfile?.displayName).toBe('王老师');
  });

  it('二次口令穿透成功后，将解密的真实学生身份映射至 unmaskedMap', async () => {
    const realStudentIdentity = {
      username: '20240999',
      realName: '真实来访学生',
      gradeClass: '高一 (3) 班',
      emergencyContact: '班主任王老师 (13800138000)',
      boothLocation: '高中部教学楼连廊终端 #01',
      crisisNote: '学生自述有跳楼意向',
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/crisis/unmask')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              session_id: 'sess_123',
              realIdentity: realStudentIdentity,
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, logs: [] }),
      });
    });

    const res = await useAdminStore
      .getState()
      .unmaskCrisis('sess_123', 'teacher-safe-2026', '王老师');
    expect(res.success).toBe(true);
    expect(res.identity?.realName).toBe('真实来访学生');

    const mapped = useAdminStore.getState().unmaskedMap['sess_123'];
    expect(mapped).toBeDefined();
    expect(mapped.username).toBe('20240999');
    expect(mapped.realName).toBe('真实来访学生');
  });

  it('更新危机处置状态与老师批注，同步更新状态树并杜绝向公共 localStorage 泄密', async () => {
    useAdminStore.setState({
      crises: [
        {
          sessionId: 'sess_999',
          duration: 300,
          crisisLevel: 3,
          crisisSummary: '高危预警',
          coreConcerns: ['人际冲突'],
          emotionalValence: -0.8,
          dispositionStatus: 'pending_contact',
          dispositionNote: '',
          createdAt: 1000,
          hasEncryptedIdentity: true,
        },
      ],
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const ok = await useAdminStore
      .getState()
      .updateDisposition('sess_999', 'intervened', '已在咨询室开展线下危机评估');
    expect(ok).toBe(true);
    const updated = useAdminStore.getState().crises.find((c) => c.sessionId === 'sess_999');
    expect(updated?.dispositionStatus).toBe('intervened');
    expect(updated?.dispositionNote).toBe('已在咨询室开展线下危机评估');

    // 验证公共终端安全：严禁将敏感个案报告写入公共 rethink_real_sessions
    const localRaw = localStorage.getItem('rethink_real_sessions');
    expect(localRaw).toBeNull();
  });

  it('危机处置结案后，通过 fetchCrises 能够获取远端最新结案状态并驱动大盘', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/crises')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              crises: [
                {
                  sessionId: 'sess_crisis_closed',
                  duration: 250,
                  crisisLevel: 3,
                  crisisSummary: '已脱离危机危险',
                  coreConcerns: ['学业焦虑'],
                  emotionalValence: 0.1,
                  dispositionStatus: 'closed',
                  dispositionNote: '经心理老师与家长线下介入，危机已解除并结案',
                  createdAt: 2000,
                  hasEncryptedIdentity: true,
                },
              ],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    await useAdminStore.getState().fetchCrises();
    const crisis = useAdminStore
      .getState()
      .crises.find((c) => c.sessionId === 'sess_crisis_closed');
    expect(crisis?.dispositionStatus).toBe('closed');
    expect(crisis?.dispositionNote).toBe('经心理老师与家长线下介入，危机已解除并结案');
  });

  function mockPasscodeFetch(endpointSubstr: string) {
    return vi.fn().mockImplementation((url: string, opts: any) => {
      if (url.includes(endpointSubstr)) {
        const body = JSON.parse(opts.body);
        const isCorrect = body.secondary_passcode === 'teacher-safe-2026';
        return Promise.resolve({
          ok: isCorrect,
          json: () =>
            Promise.resolve(
              isCorrect
                ? { success: true, session_id: body.session_id }
                : { success: false, error: '口令错误' },
            ),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, sessions: [], crises: [], logs: [] }),
      });
    });
  }

  it('安全归档软删除需口令验证，成功后触发刷新并保留底层数据', async () => {
    globalThis.fetch = mockPasscodeFetch('/api/admin/sessions/delete');

    const failRes = await useAdminStore
      .getState()
      .deleteSession('sess_123', 'wrong-code', '测试删除');
    expect(failRes.success).toBe(false);

    const successRes = await useAdminStore
      .getState()
      .deleteSession('sess_123', 'teacher-safe-2026', '演练结束安全归档');
    expect(successRes.success).toBe(true);
  });

  it('恢复档案接口需口令验证，成功后恢复档案', async () => {
    globalThis.fetch = mockPasscodeFetch('/api/admin/sessions/restore');

    const failRes = await useAdminStore.getState().restoreSession('sess_123', 'wrong');
    expect(failRes.success).toBe(false);

    const okRes = await useAdminStore.getState().restoreSession('sess_123', 'teacher-safe-2026');
    expect(okRes.success).toBe(true);
  });

  it('modeStore 支持切换至 admin 教师后台模式并触发持久化', () => {
    useModeStore.getState().setRunMode('admin');
    expect(useModeStore.getState().runMode).toBe('admin');
    expect(localStorage.getItem('rethink_run_mode')).toBe('admin');
  });

  it('reEvaluateSession 能够向后端请求重新提炼并更新本地状态', async () => {
    useAdminStore.setState({
      sessions: [
        {
          id: 'sess_123',
          sessionId: 'sess_123',
          duration: 120,
          stage: 'Active_Listening',
          isCrisis: false,
          crisisLevel: 0,
          crisisSummary: '旧评估',
          coreConcerns: ['初始交流'],
          emotionalValence: 0.0,
          dispositionStatus: 'pending_contact',
          dispositionNote: '',
          createdAt: 1000,
        } as any,
      ],
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/sessions/re-evaluate')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              report: {
                coreConcerns: ['考前焦虑'],
                crisisSummary: '由 DeepSeek V4 Flash 重新提炼评估',
                evaluatedBy: 'DeepSeek V4 Flash',
              },
              session: {
                sessionId: 'sess_123',
                coreConcerns: ['考前焦虑'],
                crisisSummary: '由 DeepSeek V4 Flash 重新提炼评估',
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
    });

    const res = await useAdminStore.getState().reEvaluateSession('sess_123', '学生：我考试好焦虑');
    expect(res.success).toBe(true);
    expect(res.report?.evaluatedBy).toBe('DeepSeek V4 Flash');
    const updated = useAdminStore.getState().sessions.find((s) => s.sessionId === 'sess_123');
    expect(updated?.crisisSummary).toBe('由 DeepSeek V4 Flash 重新提炼评估');
  });

  it('navigateToSessionsWithTag 能够平滑切换选项卡并预置创伤/议题标签过滤', () => {
    const store = useAdminStore.getState();
    store.setActiveTab('pulse');
    expect(useAdminStore.getState().activeTab).toBe('pulse');
    expect(useAdminStore.getState().sessionFilterTag).toBeNull();

    store.navigateToSessionsWithTag('人际冲突');
    expect(useAdminStore.getState().activeTab).toBe('sessions');
    expect(useAdminStore.getState().sessionFilterTag).toBe('人际冲突');

    useAdminStore.getState().setSessionFilterTag(null);
    expect(useAdminStore.getState().sessionFilterTag).toBeNull();
  });

  it('navigateToCrisesWithStatus 能够平滑切换至危机中心并自动筛选待跟进状态', () => {
    const store = useAdminStore.getState();
    store.setActiveTab('pulse');

    store.navigateToCrisesWithStatus('pending_contact');
    expect(useAdminStore.getState().activeTab).toBe('crises');
    expect(useAdminStore.getState().crisisFilterStatus).toBe('pending_contact');

    useAdminStore.getState().setCrisisFilterStatus('all');
    expect(useAdminStore.getState().crisisFilterStatus).toBe('all');
  });

  it('dismissCrisisAlert 能够记录稍后提醒的会话编号', () => {
    const store = useAdminStore.getState();
    expect(store.dismissedAlertSessionIds).toEqual([]);

    store.dismissCrisisAlert('sess_crisis_001');
    expect(useAdminStore.getState().dismissedAlertSessionIds).toContain('sess_crisis_001');
  });

  it('playBuzzer 播放结束后能够安全关闭 AudioContext 并断开音频节点，防止并发泄漏', () => {
    const closeSpy = vi.fn();
    const oscDisconnectSpy = vi.fn();
    const gainDisconnectSpy = vi.fn();
    let onendedHandler: (() => void) | null = null;

    const mockOsc = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: oscDisconnectSpy,
      set onended(fn: any) {
        onendedHandler = fn;
      },
      get onended() {
        return onendedHandler;
      },
    };

    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: gainDisconnectSpy,
    };

    const mockCtx = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createOscillator: () => mockOsc,
      createGain: () => mockGain,
      close: closeSpy,
    };

    const originalAudioContext = window.AudioContext;
    (window as any).AudioContext = vi.fn().mockImplementation(() => mockCtx);

    try {
      useAdminStore.getState().playBuzzer();
      expect(mockOsc.start).toHaveBeenCalled();
      expect(mockOsc.stop).toHaveBeenCalled();
      expect(onendedHandler).toBeTypeOf('function');

      if (onendedHandler) {
        (onendedHandler as () => void)();
      }

      expect(oscDisconnectSpy).toHaveBeenCalled();
      expect(gainDisconnectSpy).toHaveBeenCalled();
      expect(closeSpy).toHaveBeenCalled();
    } finally {
      (window as any).AudioContext = originalAudioContext;
    }
  });
});
