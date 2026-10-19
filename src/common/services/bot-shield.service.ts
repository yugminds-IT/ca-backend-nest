import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BotShieldService {
  private readonly logger = new Logger(BotShieldService.name);

  /**
   * Verify Cloudflare Turnstile token with Cloudflare API.
   * Documentation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
   */
  async verifyTurnstile(
    token: string,
    secretKey: string,
    remoteIp?: string,
  ): Promise<{ success: boolean; errorCodes?: string[] }> {
    if (!token || !secretKey) return { success: false, errorCodes: ['missing-input'] };

    try {
      const formData = new URLSearchParams();
      formData.append('secret', secretKey);
      formData.append('response', token);
      if (remoteIp) formData.append('remoteip', remoteIp);

      const res = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        },
      );

      const data = (await res.json()) as any;
      if (!data.success) {
        this.logger.warn(`Turnstile validation failed: ${JSON.stringify(data['error-codes'])}`);
        return { success: false, errorCodes: data['error-codes'] };
      }
      return { success: true };
    } catch (err) {
      this.logger.error('Failed to contact Cloudflare Turnstile API', err);
      return { success: false, errorCodes: ['network-error'] };
    }
  }

  /**
   * Verify Google reCAPTCHA v3 token with Google API.
   * Documentation: https://developers.google.com/recaptcha/docs/v3
   */
  async verifyRecaptcha(
    token: string,
    secretKey: string,
    remoteIp?: string,
  ): Promise<{ success: boolean; score?: number }> {
    if (!token || !secretKey) return { success: false };

    try {
      const formData = new URLSearchParams();
      formData.append('secret', secretKey);
      formData.append('response', token);
      if (remoteIp) formData.append('remoteip', remoteIp);

      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      const data = (await res.json()) as any;
      // Google v3 returns a score between 0.0 (bot) and 1.0 (human)
      const passed = data.success && (data.score === undefined || data.score >= 0.5);
      return { success: passed, score: data.score };
    } catch (err) {
      this.logger.error('Failed to contact Google reCAPTCHA API', err);
      return { success: false };
    }
  }
}
