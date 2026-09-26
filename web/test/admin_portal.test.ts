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

  it('更新危机处置状态与老师批注，同步更新状态树', async () => {
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
  });

  it('安全归档软删除需口令验证，成功后触发刷新并保留底层数据', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      if (url.includes('/api/admin/sessions/delete')) {
        const body = JSON.parse(opts.body);
        if (body.secondary_passcode === 'teacher-safe-2026') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, session_id: body.session_id }),
          });
        }
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ success: false, error: '二次口令错误' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, sessions: [], crises: [], logs: [] }),
      });
    });

    const failRes = await useAdminStore.getState().deleteSession('sess_123', 'wrong-code', '测试删除');
    expect(failRes.success).toBe(false);

    const successRes = await useAdminStore.getState().deleteSession('sess_123', 'teacher-safe-2026', '演练结束安全归档');
    expect(successRes.success).toBe(true);
  });

  it('恢复档案接口需口令验证，成功后恢复档案', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      if (url.includes('/api/admin/sessions/restore')) {
        const body = JSON.parse(opts.body);
        if (body.secondary_passcode === 'teacher-safe-2026') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, session_id: body.session_id }),
          });
        }
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ success: false, error: '口令错误' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, sessions: [], crises: [], logs: [] }),
      });
    });

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
