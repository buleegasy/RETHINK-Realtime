const PBKDF2_KEY_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 16;
const GCM_IV_BYTES = 12;

async function deriveAesKeyPbkdf2(secretKey: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_KEY_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 基于 PBKDF2-HMAC-SHA256 (100k 迭代) 派生 256 位密钥的 AES-GCM 高强度加密
 * 数据封装结构: [Salt (16 字节)] + [IV (12 字节)] + [Ciphertext + AuthTag]
 */
export async function encryptAesGcm(plainText: string, secretKey: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));

  const keyMaterial = await deriveAesKeyPbkdf2(secretKey, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    enc.encode(plainText)
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

/**
 * AES-GCM 安全解密 (优先 PBKDF2 动态派生解密，兼容早期遗留格式平滑迁移)
 */
export async function decryptAesGcm(cipherBase64: string, secretKey: string): Promise<string> {
  const dec = new TextDecoder();
  const binary = atob(cipherBase64);
  const rawBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    rawBytes[i] = binary.charCodeAt(i);
  }

  // 1. 优先尝试标准 PBKDF2 派生解密 (Salt 16B + IV 12B)
  if (rawBytes.length >= PBKDF2_SALT_BYTES + GCM_IV_BYTES + 16) {
    try {
      const salt = rawBytes.slice(0, PBKDF2_SALT_BYTES);
      const iv = rawBytes.slice(PBKDF2_SALT_BYTES, PBKDF2_SALT_BYTES + GCM_IV_BYTES);
      const data = rawBytes.slice(PBKDF2_SALT_BYTES + GCM_IV_BYTES);

      const keyMaterial = await deriveAesKeyPbkdf2(secretKey, salt);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        keyMaterial,
        data
      );
      return dec.decode(decrypted);
    } catch {
      // 若 PBKDF2 解密不匹配，平滑回退至遗留格式尝试
    }
  }

  // 2. 遗留格式兼容兜底: IV 12B + 截断填充 Key
  const enc = new TextEncoder();
  const legacyIv = rawBytes.slice(0, 12);
  const legacyData = rawBytes.slice(12);

  const legacyKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey.padEnd(32, '#').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const legacyDecrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: legacyIv },
    legacyKey,
    legacyData
  );
  return dec.decode(legacyDecrypted);
}
