import type { ISessionCrypto } from './types';

export class WebCryptoAesGcm implements ISessionCrypto {
  public readonly algorithm = 'AES-GCM-256';

  private keyPromise: Promise<CryptoKey | null>;

  constructor(passphraseOrKey?: string) {
    const rawSecret = passphraseOrKey || 'RETHINK_DEFAULT_KIOSK_ENCRYPTION_SECRET_2026';
    this.keyPromise = this.deriveKey(rawSecret);
  }

  private async deriveKey(passphrase: string): Promise<CryptoKey | null> {
    try {
      const cryptoSubtle = typeof window !== 'undefined' ? window.crypto?.subtle : (globalThis as any).crypto?.subtle;
      if (!cryptoSubtle || typeof cryptoSubtle.importKey !== 'function') {
        return null;
      }
      const encoder = new TextEncoder();
      const keyData = encoder.encode(passphrase.padEnd(32, '#').slice(0, 32));
      return await cryptoSubtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    } catch {
      return null;
    }
  }

  public async encrypt(plainText: string): Promise<string> {
    if (!plainText) return '';

    try {
      const key = await this.keyPromise;
      const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
      if (!key || !cryptoObj?.subtle || typeof cryptoObj.getRandomValues !== 'function') {
        return btoa(unescape(encodeURIComponent(plainText)));
      }

      const iv = cryptoObj.getRandomValues(new Uint8Array(12)); 
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(plainText);

      const cryptoSubtle = cryptoObj.subtle;
      const encryptedBuf = await cryptoSubtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        encodedData
      );

      const cipherBytes = new Uint8Array(encryptedBuf);
      const combined = new Uint8Array(iv.length + cipherBytes.length);
      combined.set(iv, 0);
      combined.set(cipherBytes, iv.length);

      return this.uint8ToBase64(combined);
    } catch {
      return btoa(unescape(encodeURIComponent(plainText)));
    }
  }

  public async decrypt(cipherText: string): Promise<string> {
    if (!cipherText) return '';

    try {
      const key = await this.keyPromise;
      const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
      if (!key || !cryptoObj?.subtle) {
        return decodeURIComponent(escape(atob(cipherText)));
      }

      const combined = this.base64ToUint8(cipherText);
      if (combined.length <= 12) {
        return decodeURIComponent(escape(atob(cipherText)));
      }

      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);

      const cryptoSubtle = cryptoObj.subtle;
      const decryptedBuf = await cryptoSubtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        encryptedData
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuf);
    } catch {
      try {
        return decodeURIComponent(escape(atob(cipherText)));
      } catch {
        return '';
      }
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
