import { decryptPlainPassword, encryptPlainPassword } from './encryption';

describe('stored client password encryption', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('round-trips with a fresh IV each time', () => {
    process.env.SECRET_KEY = 'k1';
    delete process.env.ENCRYPTION_KEY;
    const a = encryptPlainPassword('Pa55word!')!;
    const b = encryptPlainPassword('Pa55word!')!;
    expect(a).not.toBe(b);
    expect(decryptPlainPassword(a)).toBe('Pa55word!');
  });

  it('fails closed on tampering or a different key', () => {
    process.env.SECRET_KEY = 'k1';
    const enc = encryptPlainPassword('secret')!;
    const bytes = Buffer.from(enc, 'base64');
    bytes[bytes.length - 1] ^= 1;
    expect(decryptPlainPassword(bytes.toString('base64'))).toBeNull();

    process.env.SECRET_KEY = 'k2';
    expect(decryptPlainPassword(enc)).toBeNull();
  });

  it('stores nothing when no key is configured', () => {
    delete process.env.SECRET_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(encryptPlainPassword('secret')).toBeNull();
  });
});
