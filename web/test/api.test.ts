import { describe, it, expect, beforeEach } from 'vitest';
import { getWsUrl } from '../src/lib/api';

describe('Web API & WebSocket URL 构造测试', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('未提供 token 且无本地存储时，URL 不包含 token 参数', () => {
    const url = getWsUrl({ sessionId: 'sess_123' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('token')).toBeNull();
    expect(parsed.searchParams.get('sessionId')).toBe('sess_123');
    expect(parsed.searchParams.get('model')).toBe('minimax-realtime');
  });

  it('显式传入 token 时，URL 应正确拼装 token 参数', () => {
    const url = getWsUrl({
      sessionId: 'sess_456',
      token: 'explicit_test_token_jwt',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('token')).toBe('explicit_test_token_jwt');
    expect(parsed.searchParams.get('sessionId')).toBe('sess_456');
  });

  it('从 rethink_auth_token 本地缓存中自动提取并拼装 token 参数', () => {
    localStorage.setItem('rethink_auth_token', 'local_cached_token_xyz');
    const url = getWsUrl({ sessionId: 'sess_789' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('token')).toBe('local_cached_token_xyz');
  });

  it('从 rethink_auth JSON 本地存储中自动解析 token 参数', () => {
    localStorage.setItem('rethink_auth', JSON.stringify({ token: 'json_auth_token_abc' }));
    const url = getWsUrl({ sessionId: 'sess_abc' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('token')).toBe('json_auth_token_abc');
  });
});
