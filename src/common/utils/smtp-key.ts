import { ConfigService } from '@nestjs/config';
import { deriveKey } from './crypto.util';

/**
 * Returns the AES-256 key used to encrypt per-organization SMTP passwords.
 *
 * SMTP_ENCRYPTION_KEY is mandatory. There is deliberately no fallback: a fallback
 * would encrypt customer SMTP passwords with a key that is public in the repository.
 */
export function getSmtpEncryptionKey(config: ConfigService): Buffer {
  const raw = config.get<string>('SMTP_ENCRYPTION_KEY');
  if (!raw) {
    throw new Error(
      'SMTP_ENCRYPTION_KEY must be set. It encrypts per-organization SMTP passwords and has no default.',
    );
  }
  return deriveKey(raw);
}
