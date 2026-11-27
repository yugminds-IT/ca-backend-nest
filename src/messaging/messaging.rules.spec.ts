import { addressFor, toE164 } from './messaging.rules';

describe('toE164', () => {
  it('reads ten-digit numbers as India by default', () => {
    expect(toE164('98765 43210')).toBe('+919876543210');
  });

  it('accepts a leading zero and common separators', () => {
    expect(toE164('098765-43210')).toBe('+919876543210');
    expect(toE164('(+44) 20 7946 0958')).toBe('+442079460958');
  });

  it('keeps numbers that already carry a country code', () => {
    expect(toE164('+91 98765 43210')).toBe('+919876543210');
  });

  it('rejects empty and implausible numbers', () => {
    expect(toE164('')).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164('12345')).toBeNull();
    expect(toE164('+1234567890123456')).toBeNull();
  });
});

describe('addressFor', () => {
  it('prefixes WhatsApp numbers only', () => {
    expect(addressFor('whatsapp', '+919876543210')).toBe('whatsapp:+919876543210');
    expect(addressFor('sms', '+919876543210')).toBe('+919876543210');
  });
});
