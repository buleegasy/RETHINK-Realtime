import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('心理教师管理后台接口与危机穿透测试', () => {
  it('POST /api/admin/login 校验有效教师账号并返回管理凭证', async () => {
    const res = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'teacher',
        password: 'counselor2026',
      }),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.user.role).toBe('teacher');
  });

  it('GET /api/admin/stats 返回全校情绪大盘统计指标', async () => {
    const res = await app.request('/api/admin/stats');
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.stats.totalSessions).toBeGreaterThanOrEqual(1);
    expect(data.stats.concernDistribution).toBeInstanceOf(Array);
    expect(data.stats.riskDistribution).toBeInstanceOf(Array);
    expect(data.stats.weeklyTrend).toBeInstanceOf(Array);
  });

  it('GET /api/admin/sessions 返回脱敏通话记录，不泄露未授权真实身份', async () => {
    const res = await app.request('/api/admin/sessions');
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.sessions.length).toBeGreaterThan(0);
    for (const item of data.sessions) {
      expect(item.encrypted_real_identity).toBeUndefined();
    }
  });

  it('POST /api/admin/crisis/unmask 错误口令返回 403，正确口令解密出真实用户名与学号并留痕', async () => {
    const failRes = await app.request('/api/admin/crisis/unmask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'sess_sample_01',
        secondary_passcode: 'wrong-passcode',
      }),
    });
    expect(failRes.status).toBe(403);
    const failData: any = await failRes.json();
    expect(failData.success).toBe(false);

    const successRes = await app.request('/api/admin/crisis/unmask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'sess_sample_01',
        secondary_passcode: 'teacher-safe-2026',
        operator_name: '王老师 (专职心理咨询师)',
      }),
    });
    expect(successRes.status).toBe(200);
    const successData: any = await successRes.json();
    expect(successData.success).toBe(true);
    expect(successData.realIdentity.username).toBe('20240315');
    expect(successData.realIdentity.realName).toBe('林晓涵');
    expect(successData.auditLog).toBeDefined();
    expect(successData.auditLog.operator_name).toBe('王老师 (专职心理咨询师)');
  });

  it('POST /api/admin/crisis/disposition 能够更新处置跟进状态', async () => {
    const res = await app.request('/api/admin/crisis/disposition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'sess_sample_01',
        status: 'intervened',
        note: '已联系学生所在班级班主任，正在心理咨询室开展线下谈话',
      }),
    });
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe('intervened');
  });

  it('POST /api/voice/session/persist 传入自残自杀对话自动触发高危并加密身份', async () => {
    const res = await app.request('/api/voice/session/persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: `crisis_test_${Date.now()}`,
        duration: 240,
        stage: 'Crisis_Escalation',
        username: '20240999',
        transcript_text: '我真的撑不下去了，我想从教学楼跳下去，活着一点意思都没有了',
      }),
    });
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.ok).toBe(true);
    expect(data.is_crisis).toBe(true);
    expect(data.crisis_level).toBe(3);
  });
});
