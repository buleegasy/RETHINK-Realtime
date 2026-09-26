import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('Worker 路由与健康检查测试', () => {
  it('GET / 应返回健康检查状态与 minimax-realtime 模型标识', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.service).toBe('rethink-realtime-worker');
    expect(body.model).toBe('minimax-realtime');
  });

  it('POST /api/voice/knowledge 能够正确检索知识并返回结果', async () => {
    const res = await app.request('/api/voice/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '灾难化', topK: 1 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.chunks)).toBe(true);
    expect(body.chunks.length).toBeGreaterThan(0);
    expect(body.chunks[0].title).toContain('灾难化');
  });

  it('POST /api/voice/session/persist 处理空请求体时不发生 500 异常', async () => {
    const res = await app.request('/api/voice/session/persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  it('POST /api/voice/chat 处理危机词时触发紧急干预', async () => {
    const res = await app.request('/api/voice/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '我觉得活着没意思，想跳楼自杀' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.isCrisis).toBe(true);
    expect(body.nextStage).toBe('Crisis_Escalation');
  });

  it('POST /api/voice/chat 拒绝空请求', async () => {
    const res = await app.request('/api/voice/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  describe('用户认证与树莓派终端接口测试', () => {
    it('POST /api/auth/login 校验有效用户名与密码返回 Token', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.userName).toBe('testuser');
    });

    it('POST /api/auth/register 支持注册新来访者与个性化称呼', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'student01',
          password: 'secretPassword',
          displayName: '小李同学',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.user.displayName).toBe('小李同学');
    });

    it('POST /api/auth/kiosk-login 支持树莓派电话亭终端一键就绪', async () => {
      const res = await app.request('/api/auth/kiosk-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'pi-booth-campus-01' }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.user.role).toBe('kiosk_device');
      expect(data.user.deviceId).toBe('pi-booth-campus-01');
    });
  });

  describe('树莓派专属设备监控与远程配置接口测试', () => {
    it('POST /api/kiosk/heartbeat 接收设备健康心跳', async () => {
      const res = await app.request('/api/kiosk/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'pi-booth-01', uptime: 3600 }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.deviceId).toBe('pi-booth-01');
      expect(body.serverTime).toBeDefined();
    });

    it('GET /api/kiosk/config/:deviceId 返回终端配置参数', async () => {
      const res = await app.request('/api/kiosk/config/pi-booth-01');
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.config.autoResetSeconds).toBe(30);
      expect(body.config.silenceTimeoutSeconds).toBe(120);
    });
  });
});
