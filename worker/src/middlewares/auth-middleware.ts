import type { Context, Next } from 'hono';
import { verifyAuthToken, type AuthTokenPayload } from '../lib/auth-crypto';
import type { Env } from '../types';

declare module 'hono' {
  interface ContextVariableMap {
    authUser: AuthTokenPayload;
  }
}

export function createAuthMiddleware(options?: {
  allowedRoles?: Array<'teacher' | 'admin' | 'user' | 'kiosk_device'>;
}) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const authHeader = c.req.header('Authorization') || c.req.header('authorization');
    const xToken = c.req.header('x-admin-token');

    let token = '';
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (xToken) {
      token = xToken.trim();
    }

    if (!token) {
      return c.json({ success: false, error: '未提供有效鉴权凭证，请登录后重试' }, 401);
    }

    const secret = c.env?.JWT_SECRET || 'rethink-auth-salt-default-key';
    const payload = await verifyAuthToken(token, secret);

    if (!payload) {
      return c.json({ success: false, error: '鉴权凭证无效或已过期，请重新登录' }, 401);
    }

    if (options?.allowedRoles && options.allowedRoles.length > 0) {
      if (!options.allowedRoles.includes(payload.role)) {
        return c.json({ success: false, error: '当前账号角色权限不足' }, 403);
      }
    }

    c.set('authUser', payload);
    await next();
  };
}
