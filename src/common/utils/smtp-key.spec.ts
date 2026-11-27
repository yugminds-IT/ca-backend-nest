import { ConfigService } from '@nestjs/config';
import { getSmtpEncryptionKey } from './smtp-key';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('getSmtpEncryptionKey', () => {
  it('throws when SMTP_ENCRYPTION_KEY is missing (no hardcoded fallback)', () => {
    expect(() => getSmtpEncryptionKey(configWith({}))).toThrow(
      /SMTP_ENCRYPTION_KEY must be set/,
    );
  });

  it('throws when SMTP_ENCRYPTION_KEY is empty', () => {
    expect(() =>
      getSmtpEncryptionKey(configWith({ SMTP_ENCRYPTION_KEY: '' })),
    ).toThrow();
  });

  it('returns a 32-byte AES-256 key derived from the configured value', () => {
    const key = getSmtpEncryptionKey(
      configWith({ SMTP_ENCRYPTION_KEY: 'my-secret' }),
    );
    expect(key).toHaveLength(32);
  });

  it('is deterministic, so stored passwords keep decrypting across restarts', () => {
    const a = getSmtpEncryptionKey(configWith({ SMTP_ENCRYPTION_KEY: 'k' }));
    const b = getSmtpEncryptionKey(configWith({ SMTP_ENCRYPTION_KEY: 'k' }));
    expect(a.equals(b)).toBe(true);
  });
});
