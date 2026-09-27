import { Hono } from 'hono';
import type { Env } from '../types';
import { hashPassword, verifyPassword, signAuthToken } from '../lib/auth-crypto';

export const authRouter = new Hono<{ Bindings: Env }>();

let usersTableInitialized = false;

async function ensureUsersTable(env: Env): Promise<void> {
  if (!env.DB || usersTableInitialized) return;
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
    usersTableInitialized = true;
  } catch (err) {
    console.warn('[Auth] users 数据表校验跳过或已存在:', err);
  }
}

// 内存测试/无数据库兜底用户表 (加盐哈希存储)
const memoryUsers = new Map<string, { id: string; passwordHash: string; displayName: string }>();

// 初始化内置测试账号
(async () => {
  try {
    const defaultHash = await hashPassword('password123');
    memoryUsers.set('testuser', {
      id: 'usr_testuser',
      passwordHash: defaultHash,
      displayName: 'testuser',
    });
  } catch (err) {
    console.warn('[Auth] 内存默认测试用户初始化异常:', err);
  }
})();

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
  let userId = `user_${cleanUser}`;
  let isAuthenticated = false;

  await ensureUsersTable(env);

  if (env.DB) {
    try {
      const userRow = await env.DB.prepare(
        'SELECT id, username, password_hash, display_name FROM users WHERE username = ?'
      )
        .bind(cleanUser)
        .first<any>();

      if (!userRow) {
        return c.json({ success: false, error: '用户名或密码错误' }, 401);
      }

      const storedHash = userRow.password_hash || '';
      const passwordMatches = await verifyPassword(password, storedHash);

      if (!passwordMatches) {
        return c.json({ success: false, error: '用户名或密码错误' }, 401);
      }

      userId = userRow.id || userId;
      displayName = userRow.display_name || cleanUser;
      isAuthenticated = true;
    } catch (e) {
      console.warn('[Auth] D1 用户查询校验异常:', e);
      return c.json({ success: false, error: '鉴权服务暂时不可用，请稍后重试' }, 500);
    }
  } else {
    // 无 D1 绑定模式下的内存比对
    const memUser = memoryUsers.get(cleanUser);
    if (memUser) {
      const ok = await verifyPassword(password, memUser.passwordHash);
      if (!ok) {
        return c.json({ success: false, error: '用户名或密码错误' }, 401);
      }
      userId = memUser.id;
      displayName = memUser.displayName;
      isAuthenticated = true;
    } else {
      return c.json({ success: false, error: '用户名或密码错误' }, 401);
    }
  }

  if (!isAuthenticated) {
    return c.json({ success: false, error: '用户名或密码错误' }, 401);
  }

  const currentEpoch = Math.floor(Date.now() / 1000);
  const secretKey = env.JWT_SECRET || 'rethink-auth-salt-default-key';
  const token = await signAuthToken(
    {
      uid: userId,
      username: cleanUser,
      displayName,
      role: 'user',
      iat: currentEpoch,
      exp: currentEpoch + 7 * 86400, // 7 天有效
    },
    secretKey
  );

  return c.json({
    success: true,
    token,
    user: {
      uid: userId,
      userName: cleanUser,
      displayName,
      role: 'user',
      isAuthenticated: true,
    },
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
  const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const passwordHash = await hashPassword(password);

  await ensureUsersTable(env);

  if (env.DB) {
    try {
      await env.DB.prepare(
        'INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)'
      )
        .bind(newUserId, cleanUser, passwordHash, chosenName)
        .run();
    } catch (dbErr: any) {
      if (dbErr?.message?.includes('UNIQUE')) {
        return c.json({ success: false, error: '该用户名已被注册，请直接登录' }, 400);
      }
      console.warn('[Auth] D1 注册持久化异常:', dbErr);
      return c.json({ success: false, error: '注册失败，请稍后重试' }, 500);
    }
  } else {
    if (memoryUsers.has(cleanUser)) {
      return c.json({ success: false, error: '该用户名已被注册，请直接登录' }, 400);
    }
    memoryUsers.set(cleanUser, {
      id: newUserId,
      passwordHash,
      displayName: chosenName,
    });
  }

  const currentEpoch = Math.floor(Date.now() / 1000);
  const secretKey = env.JWT_SECRET || 'rethink-auth-salt-default-key';
  const token = await signAuthToken(
    {
      uid: newUserId,
      username: cleanUser,
      displayName: chosenName,
      role: 'user',
      iat: currentEpoch,
      exp: currentEpoch + 7 * 86400,
    },
    secretKey
  );

  return c.json({
    success: true,
    token,
    user: {
      uid: newUserId,
      userName: cleanUser,
      displayName: chosenName,
      role: 'user',
      isAuthenticated: true,
    },
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

  const env = c.env || {};
  const currentEpoch = Math.floor(Date.now() / 1000);
  const secretKey = env.JWT_SECRET || 'rethink-auth-salt-default-key';
  const token = await signAuthToken(
    {
      uid: `device_${deviceId}`,
      username: `kiosk_${deviceId}`,
      displayName: `咨询终端 (${deviceId})`,
      role: 'kiosk_device',
      iat: currentEpoch,
      exp: currentEpoch + 30 * 86400, // 终端 Token 30 天有效
    },
    secretKey
  );

  return c.json({
    success: true,
    token,
    user: {
      uid: `device_${deviceId}`,
      userName: '来访者',
      displayName: `咨询终端 (${deviceId})`,
      role: 'kiosk_device',
      deviceId,
      isAuthenticated: true,
    },
  });
});
