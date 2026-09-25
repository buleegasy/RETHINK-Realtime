export async function encryptAesGcm(plainText: string, secretKey: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey.padEnd(32, '#').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    enc.encode(plainText)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

export async function decryptAesGcm(cipherBase64: string, secretKey: string): Promise<string> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const binary = atob(cipherBase64);
  const rawBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    rawBytes[i] = binary.charCodeAt(i);
  }

  const iv = rawBytes.slice(0, 12);
  const data = rawBytes.slice(12);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey.padEnd(32, '#').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    data
  );
  return dec.decode(decrypted);
}
