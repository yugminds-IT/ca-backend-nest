import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac } from 'crypto';
import { EmailLog } from '../../entities/email-log.entity';
import { WebhookEndpoint } from '../../entities/webhook-endpoint.entity';
import { EmailService } from '../../email/email.service';
import { ComplianceService } from '../../compliance/compliance.service';
import { sanitizeHeader, sanitizeRecipients } from '../../common/utils/security-sanitizer.util';

export interface QueuedEmailJob {
  messageId: string;
  orgId: number;
  apiKeyId: number | null;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  attempts: number;
  maxAttempts: number;
}

@Injectable()
export class EmailDispatchQueueService {
  private readonly logger = new Logger(EmailDispatchQueueService.name);
  private readonly queue: QueuedEmailJob[] = [];
  private isProcessing = false;

  constructor(
    @InjectRepository(EmailLog)
    private emailLogRepo: Repository<EmailLog>,
    @InjectRepository(WebhookEndpoint)
    private webhookRepo: Repository<WebhookEndpoint>,
    private emailService: EmailService,
    private complianceService: ComplianceService,
  ) {
    // Process queue in background
    setInterval(() => this.processNextBatch(), 1000);
  }

  /**
   * Enqueue email for asynchronous dispatch with retry support.
   */
  async enqueue(job: Omit<QueuedEmailJob, 'attempts' | 'maxAttempts'>) {
    const primaryRecipient = job.to[0]?.toLowerCase().trim();

    // 1. Check Suppression List before queuing
    if (primaryRecipient) {
      const isSuppressed = await this.complianceService.isSuppressed(job.orgId, primaryRecipient);
      if (isSuppressed) {
        this.logger.warn(`Email to ${primaryRecipient} blocked by suppression list`);
        const log = await this.emailLogRepo.findOne({ where: { messageId: job.messageId } });
        if (log) {
          log.status = 'failed';
          log.errorMessage = 'Blocked: Recipient has unsubscribed or previously bounced (Suppression List)';
          await this.emailLogRepo.save(log);
        }
        return;
      }
    }

    this.queue.push({
      ...job,
      attempts: 0,
      maxAttempts: 3,
    });
  }

  private async processNextBatch() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    // Concurrency: process up to 5 jobs simultaneously
    const batch = this.queue.splice(0, 5);
    await Promise.allSettled(batch.map((job) => this.dispatchJob(job)));

    this.isProcessing = false;
  }

  private async dispatchJob(job: QueuedEmailJob) {
    job.attempts += 1;
    const cleanSubject = sanitizeHeader(job.subject);
    const cleanRecipients = sanitizeRecipients(job.to);
    const primaryRecipient = cleanRecipients[0];

    // RFC 8058 One-Click Unsubscribe Token & Link
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const unsubToken = this.complianceService.generateUnsubscribeToken(primaryRecipient, job.orgId);
    const unsubUrl = `${backendUrl}/api/v1/unsubscribe?token=${unsubToken}`;

    const unsubFooter = `
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
        <p>You received this email because you are registered with this service.</p>
        <p><a href="${unsubUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe from these emails</a></p>
      </div>
    `;

    const finalHtml = job.html.includes('</body>')
      ? job.html.replace('</body>', `${unsubFooter}</body>`)
      : `${job.html}${unsubFooter}`;

    const sent = await this.emailService.sendMail(
      primaryRecipient,
      cleanSubject,
      job.text,
      finalHtml,
      undefined,
      job.orgId,
    );

    const log = await this.emailLogRepo.findOne({ where: { messageId: job.messageId } });

    if (sent) {
      if (log) {
        log.status = 'delivered';
        log.deliveredAt = new Date();
        await this.emailLogRepo.save(log);
      }
      void this.emitWebhook(job.orgId, 'email.delivered', {
        id: job.messageId,
        recipient: primaryRecipient,
        subject: cleanSubject,
        deliveredAt: new Date().toISOString(),
      });
    } else {
      if (job.attempts < job.maxAttempts) {
        // Exponential backoff: re-queue after delay (10s, 60s)
        const delayMs = job.attempts === 1 ? 10000 : 60000;
        this.logger.warn(`Dispatch attempt ${job.attempts} failed for ${job.messageId}. Retrying in ${delayMs / 1000}s`);
        setTimeout(() => this.queue.push(job), delayMs);
      } else {
        this.logger.error(`Dispatch permanently failed for ${job.messageId} after ${job.attempts} attempts`);
        if (log) {
          log.status = 'failed';
          log.errorMessage = 'SMTP delivery failed after max retries';
          await this.emailLogRepo.save(log);
        }
        void this.emitWebhook(job.orgId, 'email.bounced', {
          id: job.messageId,
          recipient: primaryRecipient,
          subject: cleanSubject,
          error: 'SMTP delivery failed',
          failedAt: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Emit HMAC-SHA256 signed webhook event to developer endpoints.
   */
  async emitWebhook(orgId: number, event: string, payload: Record<string, any>) {
    try {
      const endpoints = await this.webhookRepo.find({
        where: { organizationId: orgId, isActive: true },
      });

      const matched = endpoints.filter(
        (ep) => ep.events.includes(event) || ep.events.includes('*'),
      );

      for (const ep of matched) {
        const bodyStr = JSON.stringify({ event, data: payload, timestamp: Date.now() });
        const signature = createHmac('sha256', ep.secret).update(bodyStr).digest('hex');

        fetch(ep.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CAA-Signature': `t=${Date.now()},v1=${signature}`,
            'User-Agent': 'CAA-Webhook-Emitter/2.0',
          },
          body: bodyStr,
          signal: AbortSignal.timeout(5000), // 5s timeout
        }).catch((err) => {
          this.logger.warn(`Failed to deliver webhook to ${ep.url}: ${err.message}`);
        });
      }
    } catch (err) {
      this.logger.error('Webhook emitter error', err);
    }
  }
}
