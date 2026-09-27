import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signAuthToken, verifyAuthToken } from '../src/lib/auth-crypto';
import { encryptAesGcm, decryptAesGcm } from '../src/lib/crypto-helper';

describe('安全密码学与鉴权测试 (auth-crypto & crypto-helper)', () => {
  it('PBKDF2 密码加盐哈希：正向匹配与错误拦截', async () => {
    const rawPass = 'TeacherSecure@2026';
    const hash = await hashPassword(rawPass);

    expect(hash.startsWith('pbkdf2:100000:')).toBe(true);

    const isMatch = await verifyPassword(rawPass, hash);
    expect(isMatch).toBe(true);

    const wrongMatch = await verifyPassword('WrongPassword', hash);
    expect(wrongMatch).toBe(false);

    const emptyMatch = await verifyPassword('', hash);
    expect(emptyMatch).toBe(false);

    const corrupted = await verifyPassword(rawPass, 'invalid:format');
    expect(corrupted).toBe(false);
  });

  it('HMAC-SHA256 Token 签发与过期/防篡改校验', async () => {
    const secret = 'test-secret-salt-2026';
    const currentEpoch = Math.floor(Date.now() / 1000);

    const validPayload = {
      uid: 'teacher_001',
      username: 'counselor_wang',
      role: 'teacher' as const,
      displayName: '王老师',
      iat: currentEpoch,
      exp: currentEpoch + 3600, // 1小时后过期
    };

    const token = await signAuthToken(validPayload, secret);
    expect(token.split('.')).toHaveLength(3);

    const verified = await verifyAuthToken(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.uid).toBe('teacher_001');
    expect(verified?.role).toBe('teacher');

    // 1. 密钥错误校验失败
    const wrongSecret = await verifyAuthToken(token, 'different-secret');
    expect(wrongSecret).toBeNull();

    // 2. Token 被篡改校验失败
    const tampered = token.slice(0, -4) + 'abcd';
    const tamperedRes = await verifyAuthToken(tampered, secret);
    expect(tamperedRes).toBeNull();

    // 3. 过期 Token 校验失败
    const expiredPayload = {
      ...validPayload,
      exp: currentEpoch - 10, // 已过期 10 秒
    };
    const expiredToken = await signAuthToken(expiredPayload, secret);
    const expiredRes = await verifyAuthToken(expiredToken, secret);
    expect(expiredRes).toBeNull();
  });

  it('AES-256-GCM (PBKDF2 派生) 加密与解密往返一致性', async () => {
    const secret = 'teacher-safe-passcode-2026';
    const plainText = JSON.stringify({
      studentId: '20240999',
      realName: '林某某',
      emergencyContact: '13800000000',
    });

    const encrypted = await encryptAesGcm(plainText, secret);
    expect(encrypted).toBeTypeOf('string');
    expect(encrypted).not.toEqual(plainText);

    const decrypted = await decryptAesGcm(encrypted, secret);
    expect(decrypted).toBe(plainText);

    // 错误密码解密失败抛出异常
    await expect(decryptAesGcm(encrypted, 'wrong-secret')).rejects.toThrow();
  });
});
