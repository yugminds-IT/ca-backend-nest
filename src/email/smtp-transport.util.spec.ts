import { effectiveSmtpSecure, friendlySmtpError } from './smtp-transport.util';

describe('effectiveSmtpSecure', () => {
  it('lets the well-known ports override a wrong flag', () => {
    expect(effectiveSmtpSecure(587, true)).toBe(false); // the "wrong version number" case
    expect(effectiveSmtpSecure(25, true)).toBe(false);
    expect(effectiveSmtpSecure(465, false)).toBe(true);
  });

  it('keeps the saved flag on other ports', () => {
    expect(effectiveSmtpSecure(2465, true)).toBe(true);
    expect(effectiveSmtpSecure(2525, false)).toBe(false);
  });
});

describe('friendlySmtpError', () => {
  it('explains the TLS mismatch', () => {
    const raw = '00D3FF0402000000:error:0A00010B:SSL routines:tls_validate_record_header:wrong version number:';
    expect(friendlySmtpError(raw)).toContain('port 465');
  });

  it('tells Gmail users to create an app password', () => {
    const raw = 'Invalid login: 534-5.7.9 Application-specific password required. https://support.google.com/mail/?p=InvalidSecondFactor';
    expect(friendlySmtpError(raw)).toContain('app password');
    expect(friendlySmtpError(raw)).toContain('apppasswords');
  });

  it('explains a refused login and an unknown host, and passes anything else through', () => {
    expect(friendlySmtpError('Invalid login: 535 Authentication failed')).toContain('username or password');
    expect(friendlySmtpError('getaddrinfo ENOTFOUND smtp.exmaple.com')).toContain('host name');
    expect(friendlySmtpError('Something odd')).toBe('Something odd');
  });
});
