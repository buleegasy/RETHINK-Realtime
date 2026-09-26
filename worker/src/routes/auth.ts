import { Hono } from 'hono';
import type { Env } from '../types';

export const authRouter = new Hono<{ Bindings: Env }>();

authRouter.post('/login', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { username, password } = body;

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return c.json({ success: false, error: '请输入有效的用户名和密码' }, 400);
  }

  const cleanUser = username.trim();
  if (cleanUser.length < 2) {
    return c.json({ success: false, error: '用户名长度不能少于 2 位' }, 400);
  }

  const env = c.env || {};
  let displayName = cleanUser;

  if (env.DB) {
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE,
          password_hash TEXT,
          display_name TEXT,
          created_at INTEGER DEFAULT (unixepoch())
        )
      `).run();

      const userRow = await env.DB.prepare('SELECT * FROM users WHERE username = ?')
        .bind(cleanUser)
        .first<any>();

      if (userRow) {
        displayName = userRow.display_name || cleanUser;
      }
    } catch (e) {
      console.warn('[Auth] D1 用户查询跳过:', e);
    }
  }

  const token = `token_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  const user = {
    uid: `user_${cleanUser}`,
    userName: displayName,
    displayName,
    role: 'user',
    isAuthenticated: true,
  };

  return c.json({
    success: true,
    token,
    user,
  });
});

authRouter.post('/register', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { username, password, displayName } = body;

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return c.json({ success: false, error: '用户名与密码为必填项' }, 400);
  }

  const cleanUser = username.trim();
  if (cleanUser.length < 2 || cleanUser.length > 30) {
    return c.json({ success: false, error: '用户名长度需在 2 到 30 位之间' }, 400);
  }

  if (password.length < 6) {
    return c.json({ success: false, error: '密码长度至少需为 6 位' }, 400);
  }

  const chosenName = (displayName && typeof displayName === 'string' && displayName.trim())
    ? displayName.trim()
    : cleanUser;

  const env = c.env || {};
  if (env.DB) {
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE,
          password_hash TEXT,
          display_name TEXT,
          created_at INTEGER DEFAULT (unixepoch())
        )
      `).run();

      await env.DB.prepare(
        'INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)'
      )
        .bind(`usr_${Date.now()}`, cleanUser, password, chosenName)
        .run();
    } catch (dbErr: any) {
      if (dbErr?.message?.includes('UNIQUE')) {
        return c.json({ success: false, error: '该用户名已被注册，请直接登录' }, 400);
      }
    }
  }

  const token = `token_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  const user = {
    uid: `user_${cleanUser}`,
    userName: chosenName,
    displayName: chosenName,
    role: 'user',
    isAuthenticated: true,
  };

  return c.json({
    success: true,
    token,
    user,
  });
});

authRouter.post('/kiosk-login', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const deviceId = (body.deviceId && typeof body.deviceId === 'string')
    ? body.deviceId.trim()
    : 'kiosk-booth-01';

  const token = `kiosk_token_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  const user = {
    uid: `device_${deviceId}`,
    userName: '来访者',
    displayName: `电话亭终端 (${deviceId})`,
    role: 'kiosk_device',
    deviceId,
    isAuthenticated: true,
  };

  return c.json({
    success: true,
    token,
    user,
  });
});
