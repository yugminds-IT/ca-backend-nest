/**
 * Turns a phone number as typed (spaces, dashes, brackets, leading zero) into E.164 for Twilio.
 * Numbers without a country code are read as `defaultCountry` (India by default, where the first customers are).
 */
export function toE164(raw: string | null | undefined, defaultCountry = '91'): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  let full: string;
  if (hasPlus) {
    full = digits;
  } else if (digits.length === 10) {
    full = defaultCountry + digits;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    full = defaultCountry + digits.slice(1);
  } else {
    full = digits;
  }
  if (full.length < 8 || full.length > 15) return null;
  return `+${full}`;
}

export type MessageChannel = 'sms' | 'whatsapp';

/** Twilio addresses WhatsApp numbers with a "whatsapp:" prefix. */
export function addressFor(channel: MessageChannel, e164: string): string {
  return channel === 'whatsapp' ? `whatsapp:${e164}` : e164;
}
