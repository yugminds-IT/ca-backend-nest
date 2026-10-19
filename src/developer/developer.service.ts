import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKey } from '../entities/api-key.entity';
import { EmailLog } from '../entities/email-log.entity';
import { FormSubmission } from '../entities/form-submission.entity';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { Organization } from '../entities/organization.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { Client } from '../entities/client.entity';
import { User } from '../entities/user.entity';
import { EmailService } from '../email/email.service';
import { EmailDispatchQueueService } from './queue/email-dispatch-queue.service';
import { ComplianceService } from '../compliance/compliance.service';
import { BotShieldService } from '../common/services/bot-shield.service';
import {
  sanitizeHeader,
  sanitizeRecipients,
  sanitizeHtml,
} from '../common/utils/security-sanitizer.util';
import {
  CreateApiKeyDto,
  UpdateApiKeyDto,
  SendEmailApiDto,
  SendFormSubmissionDto,
  CreateWebhookDto,
} from './dto/developer.dto';

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class DeveloperService {
  private readonly logger = new Logger(DeveloperService.name);

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepo: Repository<ApiKey>,
    @InjectRepository(EmailLog)
    private emailLogRepo: Repository<EmailLog>,
    @InjectRepository(FormSubmission)
    private submissionRepo: Repository<FormSubmission>,
    @InjectRepository(WebhookEndpoint)
    private webhookRepo: Repository<WebhookEndpoint>,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    @InjectRepository(EmailTemplate)
    private templateRepo: Repository<EmailTemplate>,
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private emailService: EmailService,
    private queueService: EmailDispatchQueueService,
    private complianceService: ComplianceService,
    private botShieldService: BotShieldService,
  ) {}

  // ------------------------------------------------------------- API Keys
  async createApiKey(orgId: number, dto: CreateApiKeyDto) {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    if (dto.keyType === 'public') {
      const token = `pk_live_${randomBytes(16).toString('hex')}`;
      const key = this.apiKeyRepo.create({
        organizationId: orgId,
        name: dto.name,
        keyType: 'public',
        keyPrefix: `${token.slice(0, 12)}...`,
        publicKey: token,
        allowedDomains: dto.allowedDomains ?? [],
        rateLimitPerMinute: dto.rateLimitPerMinute ?? 60,
        isActive: true,
      });
      const saved = await this.apiKeyRepo.save(key);
      return {
        id: saved.id,
        name: saved.name,
        keyType: saved.keyType,
        key: token, // Public key is returned and safe to view
        publicKey: token,
        keyPrefix: saved.keyPrefix,
        allowedDomains: saved.allowedDomains,
        rateLimitPerMinute: saved.rateLimitPerMinute,
        isActive: saved.isActive,
        createdAt: saved.createdAt,
      };
    } else {
      const token = `sk_live_${randomBytes(24).toString('hex')}`;
      const hashed = hashSecret(token);
      const key = this.apiKeyRepo.create({
        organizationId: orgId,
        name: dto.name,
        keyType: 'secret',
        keyPrefix: `${token.slice(0, 12)}...`,
        keyHash: hashed,
        publicKey: null,
        allowedDomains: dto.allowedDomains ?? [],
        rateLimitPerMinute: dto.rateLimitPerMinute ?? 120,
        isActive: true,
      });
      const saved = await this.apiKeyRepo.save(key);
      return {
        id: saved.id,
        name: saved.name,
        keyType: saved.keyType,
        key: token, // Secret key shown ONCE on creation (Resend style)
        keyPrefix: saved.keyPrefix,
        rateLimitPerMinute: saved.rateLimitPerMinute,
        isActive: saved.isActive,
        createdAt: saved.createdAt,
      };
    }
  }

  async listApiKeys(orgId: number) {
    const keys = await this.apiKeyRepo.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyType: k.keyType,
      keyPrefix: k.keyPrefix,
      publicKey: k.publicKey,
      allowedDomains: k.allowedDomains,
      rateLimitPerMinute: k.rateLimitPerMinute,
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));
  }

  async updateApiKey(orgId: number, keyId: number, dto: UpdateApiKeyDto) {
    const key = await this.apiKeyRepo.findOne({ where: { id: keyId, organizationId: orgId } });
    if (!key) throw new NotFoundException('API Key not found');
    if (dto.name !== undefined) key.name = dto.name;
    if (dto.allowedDomains !== undefined) key.allowedDomains = dto.allowedDomains;
    if (dto.isActive !== undefined) key.isActive = dto.isActive;
    if (dto.rateLimitPerMinute !== undefined) key.rateLimitPerMinute = dto.rateLimitPerMinute;
    await this.apiKeyRepo.save(key);
    return key;
  }

  async revokeApiKey(orgId: number, keyId: number) {
    const key = await this.apiKeyRepo.findOne({ where: { id: keyId, organizationId: orgId } });
    if (!key) throw new NotFoundException('API Key not found');
    await this.apiKeyRepo.remove(key);
    return { success: true, message: 'API key revoked' };
  }

  // ------------------------------------------------------------- Key Authentication
  async authenticateSecretKey(rawKey: string): Promise<{ org: Organization; apiKey: ApiKey }> {
    if (!rawKey.startsWith('sk_live_')) {
      throw new UnauthorizedException('Invalid API Key format. Must start with sk_live_');
    }
    const hashed = hashSecret(rawKey);
    const apiKey = await this.apiKeyRepo.findOne({
      where: { keyHash: hashed, isActive: true },
      relations: ['organization'],
    });
    if (!apiKey) throw new UnauthorizedException('Invalid or revoked Secret API Key');
    apiKey.lastUsedAt = new Date();
    void this.apiKeyRepo.save(apiKey);
    return { org: apiKey.organization, apiKey };
  }

  async authenticatePublicKey(
    rawKey: string,
    origin?: string,
  ): Promise<{ org: Organization; apiKey: ApiKey }> {
    if (!rawKey.startsWith('pk_live_')) {
      throw new UnauthorizedException('Invalid Public Key format. Must start with pk_live_');
    }
    const apiKey = await this.apiKeyRepo.findOne({
      where: { publicKey: rawKey, isActive: true },
      relations: ['organization'],
    });
    if (!apiKey) throw new UnauthorizedException('Invalid or revoked Public API Key');

    // CORS & Domain Whitelist Validation
    if (apiKey.allowedDomains && apiKey.allowedDomains.length > 0) {
      if (!origin) {
        throw new ForbiddenException('Origin header missing. Contact form must originate from an allowed domain.');
      }
      const cleanOrigin = origin.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
      const isAllowed = apiKey.allowedDomains.some((d) => {
        const cleanD = d.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        return cleanOrigin === cleanD || cleanOrigin.endsWith(`.${cleanD}`);
      });
      if (!isAllowed) {
        throw new ForbiddenException(`Domain '${origin}' is not authorized to submit using this public key.`);
      }
    }

    apiKey.lastUsedAt = new Date();
    void this.apiKeyRepo.save(apiKey);
    return { org: apiKey.organization, apiKey };
  }

  // ------------------------------------------------------------- Contact Form Submission
  async handleFormSubmission(
    dto: SendFormSubmissionDto,
    meta: { origin?: string; referer?: string; ip?: string },
  ) {
    // 1. Anti-spam Honeypot Check
    if (dto._honey || dto._gotcha) {
      this.logger.warn(`Spam bot detected via honeypot submission from IP ${meta.ip}`);
      return { success: true, message: 'Message received' }; // Silently drop bot spam
    }

    // 2. Cloudflare Turnstile & Google reCAPTCHA Verification (if token provided)
    if (dto.turnstileToken && process.env.TURNSTILE_SECRET_KEY) {
      const turnstile = await this.botShieldService.verifyTurnstile(
        dto.turnstileToken,
        process.env.TURNSTILE_SECRET_KEY,
        meta.ip,
      );
      if (!turnstile.success) {
        throw new BadRequestException('Cloudflare Turnstile challenge failed. Submission rejected.');
      }
    }
    if (dto.recaptchaToken && process.env.RECAPTCHA_SECRET_KEY) {
      const recaptcha = await this.botShieldService.verifyRecaptcha(
        dto.recaptchaToken,
        process.env.RECAPTCHA_SECRET_KEY,
        meta.ip,
      );
      if (!recaptcha.success) {
        throw new BadRequestException('reCAPTCHA bot verification failed. Submission rejected.');
      }
    }

    // 3. Validate API Key (Accepts Public Key pk_live_ or Secret Key sk_live_)
    const keyToken = (dto.publicKey || dto.apiKey || dto.secretKey || '').trim();
    if (!keyToken) {
      throw new BadRequestException(
        'Missing API key. Provide publicKey (pk_live_...) or apiKey/secretKey (sk_live_...)',
      );
    }

    let org: Organization;
    let apiKey: ApiKey;
    if (keyToken.startsWith('sk_live_')) {
      const auth = await this.authenticateSecretKey(keyToken);
      org = auth.org;
      apiKey = auth.apiKey;
    } else {
      const auth = await this.authenticatePublicKey(keyToken, meta.origin ?? meta.referer);
      org = auth.org;
      apiKey = auth.apiKey;
    }

    // 4. Sanitize and Extract Fields
    const senderName = sanitizeHeader(dto.name || dto.senderName || dto.fullName || 'Website Visitor');
    const senderEmail = sanitizeHeader(dto.email || dto.senderEmail);
    const senderPhone = sanitizeHeader(dto.phone || dto.senderPhone || '');
    const rawMessage = dto.message || dto.comments || dto.query || '';
    const message = sanitizeHtml(rawMessage);
    const formName = sanitizeHeader(dto.formName || 'Website Contact Form');

    // Extract all custom / user-defined fields (ignore internal framework keys)
    const systemKeys = new Set([
      'publicKey',
      'apiKey',
      'secretKey',
      'turnstileToken',
      'recaptchaToken',
      '_honey',
      '_gotcha',
      '_notify',
      'notificationEmail',
      'notifyEmail',
      'name',
      'senderName',
      'fullName',
      'email',
      'senderEmail',
      'phone',
      'senderPhone',
      'message',
      'comments',
      'query',
      'formName',
    ]);

    const customFields: Record<string, any> = {};
    const customEntries: { label: string; value: string }[] = [];

    for (const [key, val] of Object.entries(dto)) {
      if (!systemKeys.has(key) && val !== undefined && val !== null && val !== '') {
        customFields[key] = val;
        const formattedLabel = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/[_-]/g, ' ')
          .replace(/^\w/, (c) => c.toUpperCase())
          .trim();
        const formattedVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        customEntries.push({ label: formattedLabel, value: formattedVal });
      }
    }

    // 5. Record Submission in Inbox
    const sub = this.submissionRepo.create({
      organizationId: org.id,
      apiKeyId: apiKey.id,
      formName,
      senderName,
      senderEmail: senderEmail || null,
      senderPhone: senderPhone || null,
      message,
      data: {
        ...dto,
        customFields,
      },
      ipAddress: meta.ip || null,
      origin: meta.origin || meta.referer || null,
      status: 'new',
    });
    await this.submissionRepo.save(sub);

    // 6. Emit Real-time Webhook for developer endpoints (including custom data)
    void this.queueService.emitWebhook(org.id, 'form.submitted', {
      id: sub.id,
      formName,
      senderName,
      senderEmail,
      senderPhone,
      message,
      customFields,
      data: dto,
      origin: sub.origin,
      submittedAt: sub.createdAt,
    });

    // 7. Resolve Target Notification Email & Send Alert
    // Priority:
    // a) Direct override in submission: dto.notificationEmail, dto.notifyEmail, dto._notify
    // b) Organization industry settings: org.industrySettings.notificationEmail
    // c) Organization registered admin/owner email in users table
    // d) Organization SMTP configuration: org.smtpFrom / org.smtpUser
    // e) System fallback: ADMIN_EMAIL or SMTP_USER env variable
    let orgTargetEmail: string | undefined =
      dto.notificationEmail ||
      dto.notifyEmail ||
      dto._notify ||
      org.industrySettings?.notificationEmail;

    if (!orgTargetEmail) {
      const adminUser = await this.userRepo.findOne({
        where: { organizationId: org.id },
        order: { id: 'ASC' },
      });
      if (adminUser?.email) {
        orgTargetEmail = adminUser.email;
      }
    }

    if (!orgTargetEmail) {
      orgTargetEmail = org.smtpFrom || org.smtpUser || process.env.ADMIN_EMAIL || process.env.SMTP_USER;
    }

    let notificationSent = false;
    if (orgTargetEmail) {
      const subject = `[${formName}] New submission from ${senderName}`;

      const customRowsHtml =
        customEntries.length > 0
          ? `
        <div style="margin-top: 18px;">
          <h4 style="margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">
            Custom Form Details (${customEntries.length} fields)
          </h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
            <tbody>
              ${customEntries
                .map(
                  (e, idx) => `
                <tr style="background: ${idx % 2 === 0 ? '#f8fafc' : '#ffffff'};">
                  <td style="padding: 8px 12px; font-weight: 600; color: #475569; width: 35%; border-bottom: 1px solid #e2e8f0;">${escapeHtml(e.label)}</td>
                  <td style="padding: 8px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${escapeHtml(e.value)}</td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
          : '';

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
          <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Website Inquiry Alert</span>
            <h2 style="color: #0f172a; margin: 4px 0 0; font-size: 20px;">${escapeHtml(formName)}</h2>
          </div>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 13px;">
            <p style="margin: 0 0 6px;"><strong>Sender Name:</strong> ${escapeHtml(senderName)}</p>
            <p style="margin: 0 0 6px;"><strong>Email:</strong> ${senderEmail ? `<a href="mailto:${senderEmail}" style="color: #2563eb; text-decoration: none;">${escapeHtml(senderEmail)}</a>` : '<span style="color: #94a3b8;">None provided</span>'}</p>
            <p style="margin: 0 0 6px;"><strong>Phone:</strong> ${senderPhone ? escapeHtml(senderPhone) : '<span style="color: #94a3b8;">None provided</span>'}</p>
            <p style="margin: 0;"><strong>Source Origin:</strong> <code style="font-size: 12px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${escapeHtml(meta.origin || meta.referer || 'Direct API Call')}</code></p>
          </div>
          ${customRowsHtml}
          ${
            message
              ? `
            <div style="margin-top: 18px;">
              <h4 style="margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">Message Content</h4>
              <div style="background: #ffffff; border: 1px solid #cbd5e1; padding: 14px; border-radius: 8px; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${message}</div>
            </div>
          `
              : ''
          }
          <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
            Received for <strong>${escapeHtml(org.name)}</strong> via Website Contact Form Gateway.
          </div>
        </div>
      `;

      const customTextSummary = customEntries.map((e) => `${e.label}: ${e.value}`).join('\n');
      const text = `New submission from ${senderName} (${formName})\nEmail: ${senderEmail || 'N/A'}\nPhone: ${senderPhone || 'N/A'}\n\n${customTextSummary ? `Custom Data:\n${customTextSummary}\n\n` : ''}Message:\n${rawMessage}`;

      try {
        notificationSent = await this.emailService.sendMail(
          orgTargetEmail,
          subject,
          text,
          html,
          `${org.name} Website Forms`,
          org.id,
        );
        this.logger.log(`Website form notification delivered to ${orgTargetEmail} (status: ${notificationSent})`);
      } catch (err: any) {
        this.logger.error(`Failed to dispatch form notification to ${orgTargetEmail}: ${err.message}`, err.stack);
      }
    } else {
      this.logger.warn(`No notification email address found for organization #${org.id}`);
    }

    // 8. Auto-responder to Visitor (if email provided and not suppressed)
    if (senderEmail && senderEmail.includes('@')) {
      const isSuppressed = await this.complianceService.isSuppressed(org.id, senderEmail);
      if (!isSuppressed) {
        const autoTemplate = await this.templateRepo.findOne({
          where: { organizationId: org.id, type: 'contact_auto_responder' },
        });

        let autoSubject = `Thank you for contacting ${org.name}!`;
        let autoHtml = `
          <div style="font-family: sans-serif; max-width: 600px; padding: 20px;">
            <p>Hello ${escapeHtml(senderName)},</p>
            <p>Thank you for reaching out to <strong>${escapeHtml(org.name)}</strong>. We have received your inquiry and will respond as soon as possible.</p>
            <p>Best regards,<br/>Team ${escapeHtml(org.name)}</p>
          </div>
        `;

        if (autoTemplate) {
          const templateVars = {
            ...customFields,
            sender_name: senderName,
            name: senderName,
            email: senderEmail,
            company: org.name,
            org_name: org.name,
            message: message || rawMessage,
          };
          autoSubject = this.compileTemplate(autoTemplate.subject, templateVars);
          autoHtml = this.compileTemplate(autoTemplate.body, templateVars);
        }

        void this.emailService.sendMail(
          senderEmail,
          autoSubject,
          `Auto-response from ${org.name}`,
          autoHtml,
          org.name,
          org.id,
        );
      }
    }

    return {
      success: true,
      message: 'Thank you! Your message has been sent successfully.',
      submissionId: sub.id,
      notificationSent,
      customFieldsCount: customEntries.length,
    };
  }

  // ------------------------------------------------------------- Transactional Email API (Resend style)
  async sendTransactional(
    orgId: number,
    apiKeyId: number | null,
    dto: SendEmailApiDto,
  ) {
    const cleanRecipients = sanitizeRecipients(dto.to);
    if (cleanRecipients.length === 0) {
      throw new BadRequestException('No valid recipient email address provided');
    }

    const primaryRecipient = cleanRecipients[0];
    const messageId = `msg_${randomBytes(12).toString('hex')}`;
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    // 1. Suppression List Check (RFC compliance & deliverability protection)
    const isSuppressed = await this.complianceService.isSuppressed(orgId, primaryRecipient);
    if (isSuppressed) {
      this.logger.warn(`Email to ${primaryRecipient} suppressed for org ${orgId}`);
      const log = this.emailLogRepo.create({
        messageId,
        organizationId: orgId,
        apiKeyId,
        from: dto.from || org.smtpFrom || org.smtpUser || 'noreply@domain.com',
        to: cleanRecipients.join(', '),
        subject: sanitizeHeader(dto.subject),
        status: 'failed',
        source: 'api',
        errorMessage: 'Blocked: Recipient is on the Suppression List (Unsubscribed or Bounced)',
        variables: dto.variables ?? null,
        metadata: dto.metadata ?? null,
      });
      await this.emailLogRepo.save(log);

      return {
        id: messageId,
        from: log.from,
        to: cleanRecipients,
        subject: log.subject,
        status: 'suppressed',
        error: 'Recipient is suppressed due to previous unsubscribe or bounce',
        createdAt: log.createdAt,
      };
    }

    let subject = sanitizeHeader(dto.subject);
    let html = dto.html || '';
    let text = dto.text || '';

    // 2. Dynamic Template Compilation (if template specified)
    if (dto.templateId) {
      const template = await this.templateRepo.findOne({
        where: { id: Number(dto.templateId) },
      });
      if (template) {
        subject = sanitizeHeader(this.compileTemplate(template.subject, dto.variables ?? {}));
        html = this.compileTemplate(template.body, dto.variables ?? {});
      }
    }

    // 3. Open & Click Tracking Telemetry Injection
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    let finalHtml = html || text.replace(/\n/g, '<br/>');

    if (dto.trackClicks !== false) {
      // Rewrite hyperlinks for click telemetry
      finalHtml = finalHtml.replace(/href=["'](https?:\/\/[^"']+)["']/gi, (match, url) => {
        if (url.includes('/api/v1/unsubscribe') || url.includes('/api/v1/track/')) return match;
        const trackedUrl = `${backendUrl}/api/v1/track/click/${messageId}?url=${encodeURIComponent(url)}`;
        return `href="${trackedUrl}"`;
      });
    }

    if (dto.trackOpens !== false) {
      const trackingPixel = `<img src="${backendUrl}/api/v1/track/open/${messageId}.png" width="1" height="1" style="display:none;" alt="" />`;
      finalHtml = finalHtml.includes('</body>')
        ? finalHtml.replace('</body>', `${trackingPixel}</body>`)
        : `${finalHtml}${trackingPixel}`;
    }

    const fromAddress = sanitizeHeader(dto.from || org.smtpFrom || org.smtpUser || 'noreply@domain.com');

    // 4. Create Log Entry with initial status
    const log = this.emailLogRepo.create({
      messageId,
      organizationId: orgId,
      apiKeyId,
      from: fromAddress,
      to: cleanRecipients.join(', '),
      subject,
      status: 'queued',
      source: 'api',
      variables: dto.variables ?? null,
      metadata: dto.metadata ?? null,
    });
    await this.emailLogRepo.save(log);

    // 5. Asynchronous Queue Dispatch (Instant <30ms API response)
    void this.queueService.enqueue({
      messageId,
      orgId,
      apiKeyId,
      from: fromAddress,
      to: cleanRecipients,
      subject,
      text,
      html: finalHtml,
    });

    // 6. Emit immediate email.sent webhook
    void this.queueService.emitWebhook(orgId, 'email.sent', {
      id: messageId,
      recipient: primaryRecipient,
      subject,
      sentAt: log.createdAt,
    });

    return {
      id: messageId,
      from: fromAddress,
      to: cleanRecipients,
      subject,
      status: 'queued',
      createdAt: log.createdAt,
    };
  }

  // ------------------------------------------------------------- Open & Click Telemetry
  async recordOpen(messageId: string) {
    const log = await this.emailLogRepo.findOne({ where: { messageId } });
    if (log) {
      log.openCount += 1;
      log.openedAt = new Date();
      if (log.status !== 'clicked') log.status = 'opened';
      await this.emailLogRepo.save(log);

      void this.queueService.emitWebhook(log.organizationId, 'email.opened', {
        id: messageId,
        recipient: log.to,
        subject: log.subject,
        openCount: log.openCount,
        openedAt: log.openedAt.toISOString(),
      });
    }
  }

  async recordClick(messageId: string, targetUrl: string): Promise<string> {
    const log = await this.emailLogRepo.findOne({ where: { messageId } });
    if (log) {
      log.clickCount += 1;
      log.clickedAt = new Date();
      log.status = 'clicked';
      await this.emailLogRepo.save(log);

      void this.queueService.emitWebhook(log.organizationId, 'email.clicked', {
        id: messageId,
        recipient: log.to,
        subject: log.subject,
        targetUrl,
        clickCount: log.clickCount,
        clickedAt: log.clickedAt.toISOString(),
      });
    }
    return targetUrl || '/';
  }

  // ------------------------------------------------------------- Logs & Inbox
  async listLogs(orgId: number, status?: string) {
    const where: any = { organizationId: orgId };
    if (status) where.status = status;
    return this.emailLogRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async listSubmissions(orgId: number, status?: string) {
    const where: any = { organizationId: orgId };
    if (status && status !== 'all') where.status = status;
    const submissions = await this.submissionRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });

    if (submissions.length === 0) return [];

    // Collect all emails and phones to check for existing clients in organization
    const emailList = Array.from(
      new Set(
        submissions
          .map((s) => (s.senderEmail || s.data?.email || '').trim().toLowerCase())
          .filter((e) => e.length > 0),
      ),
    );
    const phoneList = Array.from(
      new Set(
        submissions
          .map((s) => (s.senderPhone || s.data?.phone || '').trim())
          .filter((p) => p.length >= 6),
      ),
    );

    let existingClients: Client[] = [];
    if (emailList.length > 0 || phoneList.length > 0) {
      const qb = this.clientRepo
        .createQueryBuilder('client')
        .where('client.organizationId = :orgId', { orgId });

      const conds: string[] = [];
      const params: any = { orgId };

      if (emailList.length > 0) {
        conds.push('LOWER(client.email) IN (:...emailList)');
        params.emailList = emailList;
      }
      if (phoneList.length > 0) {
        conds.push('client.phone IN (:...phoneList)');
        params.phoneList = phoneList;
      }

      qb.andWhere(`(${conds.join(' OR ')})`, params);
      existingClients = await qb
        .select(['client.id', 'client.email', 'client.phone', 'client.name', 'client.companyName'])
        .getMany();
    }

    const emailMap = new Map<string, Client>();
    const phoneMap = new Map<string, Client>();
    for (const c of existingClients) {
      if (c.email) emailMap.set(c.email.trim().toLowerCase(), c);
      if (c.phone) phoneMap.set(c.phone.trim(), c);
    }

    return submissions.map((sub) => {
      const email = (sub.senderEmail || sub.data?.email || '').trim().toLowerCase();
      const phone = (sub.senderPhone || sub.data?.phone || '').trim();
      const matched = (email && emailMap.get(email)) || (phone && phoneMap.get(phone));
      const convertedClientId = sub.data?.convertedClientId || (matched ? matched.id : null);
      const isExistingClient = Boolean(matched || sub.data?.convertedClientId);

      return {
        ...sub,
        isExistingClient,
        convertedClientId,
        matchedClientName: matched?.name || null,
      };
    });
  }

  async convertToClient(orgId: number, id: number) {
    const sub = await this.submissionRepo.findOne({
      where: { id, organizationId: orgId },
    });
    if (!sub) {
      throw new NotFoundException('Submission not found');
    }

    const email = (sub.senderEmail || sub.data?.email || '').trim().toLowerCase();
    const phone = (sub.senderPhone || sub.data?.phone || '').trim();

    // 1. Duplicate check: search for existing client in this organization
    let existingClient: Client | null = null;

    if (sub.data?.convertedClientId) {
      existingClient = await this.clientRepo.findOne({
        where: { id: sub.data.convertedClientId, organizationId: orgId },
      });
    }

    if (!existingClient && email) {
      existingClient = await this.clientRepo
        .createQueryBuilder('client')
        .where('client.organizationId = :orgId', { orgId })
        .andWhere('LOWER(TRIM(client.email)) = :email', { email })
        .getOne();
    }

    if (!existingClient && phone && phone.length >= 6) {
      existingClient = await this.clientRepo.findOne({
        where: { organizationId: orgId, phone },
      });
    }

    // Prepare inquiry timestamp & details
    const timestampStr = new Date(sub.createdAt || Date.now()).toLocaleString();
    const inquiryNote = [
      `\n\n[Website Form Submission #${sub.id} - ${timestampStr}]`,
      `Form Name: ${sub.formName || 'Website Form'}`,
      `Origin: ${sub.origin || 'Direct Submission'}`,
      `Message: ${sub.message || sub.data?.message || 'No text message provided'}`,
    ];

    if (sub.data && typeof sub.data === 'object') {
      const extraKeys = Object.keys(sub.data).filter(
        (k) => !['name', 'email', 'phone', 'message', 'convertedClientId', 'duplicateDetected', 'convertedAt'].includes(k),
      );
      if (extraKeys.length > 0) {
        const extraSummary = extraKeys.map((k) => `${k}: ${JSON.stringify(sub.data[k])}`).join(', ');
        inquiryNote.push(`Additional Form Fields: ${extraSummary}`);
      }
    }
    const noteText = inquiryNote.join('\n');

    // Case 1: Duplicate Found -> Prevent duplicate creation!
    if (existingClient) {
      existingClient.additionalNotes = `${existingClient.additionalNotes || ''}${noteText}`.trim();
      await this.clientRepo.save(existingClient);

      sub.status = 'converted';
      sub.data = {
        ...(sub.data || {}),
        convertedClientId: existingClient.id,
        duplicateDetected: true,
        convertedAt: new Date().toISOString(),
      };
      await this.submissionRepo.save(sub);

      return {
        success: true,
        alreadyExists: true,
        client: existingClient,
        message: `Existing client "${existingClient.name}" already matches email/phone (${email || phone}). Duplicate prevented! Inquiry was linked to their client profile.`,
      };
    }

    // Case 2: No duplicate -> Create brand new Client
    const clientName =
      (sub.senderName || sub.data?.name || sub.data?.fullName || '').trim() ||
      (email ? email.split('@')[0] : 'Inquiry Client');
    const company = (sub.data?.company || sub.data?.companyName || sub.data?.organization || '').trim() || null;
    const address = (sub.data?.address || '').trim() || null;
    const city = (sub.data?.city || '').trim() || null;

    const initialNotes = `[Created from Website Form Submission #${sub.id} - ${timestampStr}]${noteText}`;

    const newClient = this.clientRepo.create({
      organizationId: orgId,
      name: clientName,
      email: email || null,
      phone: phone || null,
      companyName: company,
      address,
      city,
      status: 'active',
      onboardDate: new Date(),
      additionalNotes: initialNotes,
    });

    const savedClient = await this.clientRepo.save(newClient);

    sub.status = 'converted';
    sub.data = {
      ...(sub.data || {}),
      convertedClientId: savedClient.id,
      duplicateDetected: false,
      convertedAt: new Date().toISOString(),
    };
    await this.submissionRepo.save(sub);

    return {
      success: true,
      alreadyExists: false,
      client: savedClient,
      message: `Client "${savedClient.name}" successfully created in Clients & Contacts Management!`,
    };
  }

  async updateSubmissionStatus(orgId: number, id: number, status: any) {
    const sub = await this.submissionRepo.findOne({ where: { id, organizationId: orgId } });
    if (!sub) throw new NotFoundException('Submission not found');
    sub.status = status;
    return this.submissionRepo.save(sub);
  }

  async deleteSubmission(orgId: number, id: number) {
    const sub = await this.submissionRepo.findOne({ where: { id, organizationId: orgId } });
    if (!sub) throw new NotFoundException('Submission not found');
    await this.submissionRepo.remove(sub);
    return { success: true };
  }

  // ------------------------------------------------------------- Webhooks
  async listWebhooks(orgId: number) {
    return this.webhookRepo.find({ where: { organizationId: orgId } });
  }

  async createWebhook(orgId: number, dto: CreateWebhookDto) {
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const endpoint = this.webhookRepo.create({
      organizationId: orgId,
      url: dto.url,
      secret,
      events: dto.events,
      isActive: true,
    });
    return this.webhookRepo.save(endpoint);
  }

  async deleteWebhook(orgId: number, id: number) {
    const wh = await this.webhookRepo.findOne({ where: { id, organizationId: orgId } });
    if (!wh) throw new NotFoundException('Webhook not found');
    await this.webhookRepo.remove(wh);
    return { success: true };
  }

  // ------------------------------------------------------------- Template Compiler
  private compileTemplate(text: string, variables: Record<string, any>): string {
    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
    });
  }
}
