import type { ISessionCrypto } from './types';

const SESSION_CRYPTO_PASSPHRASE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SESSION_CRYPTO_KEY) ||
  'RETHINK_KIOSK_LOCAL_CACHE_2026';

export class WebCryptoAesGcm implements ISessionCrypto {
  public readonly algorithm = 'AES-GCM-256';

  private keyPromise: Promise<CryptoKey | null>;

  constructor(passphraseOrKey?: string) {
    const passphrase = passphraseOrKey || SESSION_CRYPTO_PASSPHRASE;
    this.keyPromise = this.deriveKey(passphrase);
  }

  private async deriveKey(passphrase: string): Promise<CryptoKey | null> {
    try {
      const cryptoSubtle = typeof window !== 'undefined'
        ? window.crypto?.subtle
        : (globalThis as any).crypto?.subtle;
      if (!cryptoSubtle || typeof cryptoSubtle.importKey !== 'function') {
        return null;
      }
      const encoder = new TextEncoder();
      const baseKey = await cryptoSubtle.importKey(
        'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']
      );
      const salt = encoder.encode('rethink-session-v1');
      return await cryptoSubtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    } catch {
      return null;
    }
  }

  public async encrypt(plainText: string): Promise<string> {
    if (!plainText) return '';

    const key = await this.keyPromise;
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    if (!key || !cryptoObj?.subtle || typeof cryptoObj.getRandomValues !== 'function') {
      throw new Error('Encryption unavailable: WebCrypto not supported');
    }

    const iv = cryptoObj.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encryptedBuf = await cryptoObj.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plainText)
    );

    const cipherBytes = new Uint8Array(encryptedBuf);
    const combined = new Uint8Array(iv.length + cipherBytes.length);
    combined.set(iv, 0);
    combined.set(cipherBytes, iv.length);
    return this.uint8ToBase64(combined);
  }

  public async decrypt(cipherText: string): Promise<string> {
    if (!cipherText) return '';

    const key = await this.keyPromise;
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    if (!key || !cryptoObj?.subtle) return '';

    try {
      const combined = this.base64ToUint8(cipherText);
      if (combined.length <= 12) return '';

      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);
      const decryptedBuf = await cryptoObj.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedData
      );
      return new TextDecoder().decode(decryptedBuf);
    } catch {
      return '';
    }
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToUint8(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
