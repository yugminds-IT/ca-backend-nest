import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * Get encryption key from ENCRYPTION_KEY (base64) or derive from SECRET_KEY.
 * Returns 32-byte buffer for AES-256.
 */
function getKey(encryptionKeyEnv: string | undefined, secretKeyEnv: string | undefined): Buffer | null {
  if (encryptionKeyEnv) {
    try {
      const key = Buffer.from(encryptionKeyEnv, 'base64');
      if (key.length >= KEY_LENGTH) return key.subarray(0, KEY_LENGTH);
      // If base64 decodes to less than 32 bytes, derive with scrypt
      return scryptSync(encryptionKeyEnv, 'salt', KEY_LENGTH);
    } catch {
      // ignore
    }
  }
  if (secretKeyEnv) {
    return scryptSync(secretKeyEnv, 'encryption-salt', KEY_LENGTH);
  }
  return null;
}

/**
 * Encrypt plain text. Returns base64 string: iv (12) + authTag (16) + ciphertext.
 * Returns null if encryption is not configured.
 */
export function encryptPlainPassword(plain: string): string | null {
  if (!plain) return null;
  const key = getKey(process.env.ENCRYPTION_KEY, process.env.SECRET_KEY);
  if (!key) return null;
  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const enc = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, tag, enc]);
    return combined.toString('base64');
  } catch {
    return null;
  }
}

/**
 * Decrypt value produced by encryptPlainPassword.
 * Returns null if decryption fails or not configured.
 */
export function decryptPlainPassword(encryptedBase64: string | null | undefined): string | null {
  if (!encryptedBase64) return null;
  const key = getKey(process.env.ENCRYPTION_KEY, process.env.SECRET_KEY);
  if (!key) return null;
  try {
    const combined = Buffer.from(encryptedBase64, 'base64');
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
