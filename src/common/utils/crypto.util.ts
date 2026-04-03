import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** Derive a 32-byte AES-256 key from an arbitrary-length secret string */
export function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** Encrypt plaintext with AES-256-GCM. Returns "ivHex:authTagHex:ciphertextHex" */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypt a value produced by encrypt(). Returns original plaintext. */
export function decrypt(encryptedStr: string, key: Buffer): string {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    // Not in encrypted format — return as-is (handles legacy plaintext values)
    return encryptedStr;
  }
  const [ivHex, authTagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
