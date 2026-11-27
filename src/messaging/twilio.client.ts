import { Logger } from '@nestjs/common';
import { MessageChannel, addressFor } from './messaging.rules';

/**
 * Twilio adapter for SMS and WhatsApp. Configure with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * TWILIO_SMS_FROM and TWILIO_WHATSAPP_FROM (the WhatsApp sender, without the prefix). Each channel is enabled only when its sender is set.
 */
export interface TwilioSettings {
  accountSid: string;
  authToken: string;
  smsFrom: string | null;
  whatsappFrom: string | null;
}

export function twilioSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): TwilioSettings | null {
  const accountSid = (env.TWILIO_ACCOUNT_SID ?? '').trim();
  const authToken = (env.TWILIO_AUTH_TOKEN ?? '').trim();
  if (!accountSid || !authToken) return null;
  return {
    accountSid,
    authToken,
    smsFrom: (env.TWILIO_SMS_FROM ?? '').trim() || null,
    whatsappFrom: (env.TWILIO_WHATSAPP_FROM ?? '').trim() || null,
  };
}

export function channelEnabled(settings: TwilioSettings | null, channel: MessageChannel): boolean {
  if (!settings) return false;
  return channel === 'sms' ? !!settings.smsFrom : !!settings.whatsappFrom;
}

const logger = new Logger('Twilio');

/** Sends one message. Throws on provider failure, so the caller can avoid logging an unsent message. */
export async function sendTwilioMessage(
  settings: TwilioSettings,
  channel: MessageChannel,
  toE164Number: string,
  body: string,
): Promise<string> {
  const from = channel === 'sms' ? settings.smsFrom : settings.whatsappFrom;
  if (!from) throw new Error(`${channel} sender is not configured`);
  const form = new URLSearchParams({
    To: addressFor(channel, toE164Number),
    From: addressFor(channel, from.startsWith('+') ? from : `+${from}`),
    Body: body,
  });
  const auth = Buffer.from(`${settings.accountSid}:${settings.authToken}`).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${settings.accountSid}/Messages.json`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok || !json.sid) {
      logger.warn(`Twilio rejected ${channel} message: ${res.status} ${json.code ?? ''}`);
      throw new Error(json.message ?? `Provider responded ${res.status}`);
    }
    return json.sid;
  } finally {
    clearTimeout(timer);
  }
}
