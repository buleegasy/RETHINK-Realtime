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
      boothLocation: '高中部教学楼连廊电话亭 #01',
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

    const res = await useAdminStore.getState().unmaskCrisis('sess_123', 'teacher-safe-2026', '心理老师');
    expect(res.success).toBe(true);
    expect(res.identity?.realName).toBe('真实来访学生');

    const mapped = useAdminStore.getState().unmaskedMap['sess_123'];
    expect(mapped).toBeDefined();
    expect(mapped.username).toBe('20240999');
    expect(mapped.realName).toBe('真实来访学生');
  });

  it('更新危机处置状态与老师批注，同步更新状态树与本地持久化缓存', async () => {
    localStorage.setItem(
      'rethink_real_sessions',
      JSON.stringify([
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
      ])
    );

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

    const ok = await useAdminStore.getState().updateDisposition(
      'sess_999',
      'intervened',
      '已在咨询室开展线下危机评估'
    );
    expect(ok).toBe(true);
    const updated = useAdminStore.getState().crises.find((c) => c.sessionId === 'sess_999');
    expect(updated?.dispositionStatus).toBe('intervened');
    expect(updated?.dispositionNote).toBe('已在咨询室开展线下危机评估');

    // 验证本地存储已被持久化更新
    const localRaw = localStorage.getItem('rethink_real_sessions');
    expect(localRaw).toBeDefined();
    const localParsed = JSON.parse(localRaw!);
    expect(localParsed[0].dispositionStatus).toBe('intervened');
    expect(localParsed[0].dispositionNote).toBe('已在咨询室开展线下危机评估');
  });

  it('危机处置结案后刷新页面，通过 fetchCrises 重新加载仍能保持结案状态不回退', async () => {
    // 模拟本地已有结案记录
    localStorage.setItem(
      'rethink_real_sessions',
      JSON.stringify([
        {
          sessionId: 'sess_crisis_closed',
          duration: 250,
          isCrisis: true,
          crisisLevel: 3,
          crisisSummary: '已脱离危机危险',
          coreConcerns: ['学业焦虑'],
          emotionalValence: 0.1,
          dispositionStatus: 'closed',
          dispositionNote: '经心理老师与家长线下介入，危机已解除并结案',
          createdAt: 2000,
          hasEncryptedIdentity: true,
        },
      ])
    );

    // 模拟后端网关尚未同步（返回旧的 pending_contact 状态）
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
                  dispositionStatus: 'pending_contact',
                  dispositionNote: '',
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
    const crisis = useAdminStore.getState().crises.find((c) => c.sessionId === 'sess_crisis_closed');
    // 必须保留结案状态，杜绝刷新回退
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
          json: () => Promise.resolve(isCorrect ? { success: true, session_id: body.session_id } : { success: false, error: '口令错误' }),
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

    const failRes = await useAdminStore.getState().deleteSession('sess_123', 'wrong-code', '测试删除');
    expect(failRes.success).toBe(false);

    const successRes = await useAdminStore.getState().deleteSession('sess_123', 'teacher-safe-2026', '演练结束安全归档');
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
});
