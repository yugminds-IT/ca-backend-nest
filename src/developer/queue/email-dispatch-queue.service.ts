import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac } from 'crypto';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { EmailLog } from '../../entities/email-log.entity';
import { WebhookEndpoint } from '../../entities/webhook-endpoint.entity';
import { EmailService } from '../../email/email.service';
import { ComplianceService } from '../../compliance/compliance.service';
import {
  sanitizeHeader,
  sanitizeRecipients,
} from '../../common/utils/security-sanitizer.util';
import { EventsGateway } from '../../events/events.gateway';

export interface QueuedEmailJob {
  messageId: string;
  orgId: number;
  apiKeyId: number | null;
  /** Unit whose mail account sends this message. Null uses the organization-wide account. */
  businessUnitId?: number | null;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  attempts: number;
  maxAttempts: number;
}

const QUEUE_NAME = 'email-dispatch';
const MAX_ATTEMPTS = 3;
/** Wait before a Redis enqueue is considered failed and the job falls back to memory. */
const ENQUEUE_TIMEOUT_MS = 3000;

/**
 * Result of one send attempt.
 * - delivered: sent, or no longer needs work (log updated and webhook emitted)
 * - retry: transient failure with attempts left
 * - failed: permanent failure (attempts exhausted), log updated
 */
type DispatchOutcome = 'delivered' | 'retry' | 'failed';

/**
 * Email dispatch with retries.
 *
 * Two modes, picked at startup:
 * - REDIS_URL set: jobs go to a BullMQ queue, so pending mail survives a restart and retries are
 *   handled by BullMQ. A failed Redis enqueue falls back to memory for that job.
 * - REDIS_URL not set: in-process queue. Pending mail is lost on restart. Fine for local development.
 */
@Injectable()
export class EmailDispatchQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EmailDispatchQueueService.name);
  private readonly memoryQueue: QueuedEmailJob[] = [];
  private isProcessing = false;
  private memoryTimer: NodeJS.Timeout | null = null;
  private bullQueue: Queue<QueuedEmailJob> | null = null;
  private worker: Worker<QueuedEmailJob> | null = null;
  private connections: IORedis[] = [];

  constructor(
    @InjectRepository(EmailLog)
    private emailLogRepo: Repository<EmailLog>,
    @InjectRepository(WebhookEndpoint)
    private webhookRepo: Repository<WebhookEndpoint>,
    private emailService: EmailService,
    private complianceService: ComplianceService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  onModuleInit() {
    // The memory loop always runs: it drains fallback jobs even when Redis is configured.
    this.memoryTimer = setInterval(() => void this.processNextBatch(), 1000);

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL is not set. Email queue is in memory; pending mail is lost on restart.',
      );
      return;
    }

    try {
      // BullMQ requires maxRetriesPerRequest=null on the worker connection (it blocks on Redis).
      // The producer connection fails fast so an API request never hangs on a dead Redis.
      const producer = this.createConnection(redisUrl, 1);
      const consumer = this.createConnection(redisUrl, null);
      this.bullQueue = new Queue<QueuedEmailJob>(QUEUE_NAME, {
        connection: producer,
      });
      this.worker = new Worker<QueuedEmailJob>(
        QUEUE_NAME,
        (job) => this.processBullJob(job),
        {
          connection: consumer,
          concurrency: 5,
        },
      );
      this.worker.on('failed', (job, err) => {
        this.logger.warn(`Email job ${job?.id ?? '?'} failed: ${err.message}`);
      });
      this.logger.log('Email queue is using Redis (BullMQ)');
    } catch (err) {
      this.logger.error(
        `Could not start Redis queue, using in-memory queue: ${(err as Error).message}`,
      );
      this.bullQueue = null;
      this.worker = null;
    }
  }

  async onModuleDestroy() {
    if (this.memoryTimer) clearInterval(this.memoryTimer);
    await this.worker?.close().catch(() => undefined);
    await this.bullQueue?.close().catch(() => undefined);
    await Promise.all(
      this.connections.map((c) => c.quit().catch(() => undefined)),
    );
  }

  private createConnection(
    url: string,
    maxRetriesPerRequest: number | null,
  ): IORedis {
    const conn = new IORedis(url, { maxRetriesPerRequest });
    conn.on('error', (err) =>
      this.logger.warn(`Redis connection error: ${err.message}`),
    );
    this.connections.push(conn);
    return conn;
  }

  /**
   * Enqueue email for asynchronous dispatch with retry support.
   */
  async enqueue(job: Omit<QueuedEmailJob, 'attempts' | 'maxAttempts'>) {
    const primaryRecipient = job.to[0]?.toLowerCase().trim();

    // 1. Check Suppression List before queuing
    if (primaryRecipient) {
      const isSuppressed = await this.complianceService.isSuppressed(
        job.orgId,
        primaryRecipient,
      );
      if (isSuppressed) {
        this.logger.warn(
          `Email to ${primaryRecipient} blocked by suppression list`,
        );
        const log = await this.emailLogRepo.findOne({
          where: { messageId: job.messageId },
        });
        if (log) {
          log.status = 'failed';
          log.errorMessage =
            'Blocked: Recipient has unsubscribed or previously bounced (Suppression List)';
          await this.emailLogRepo.save(log);
          this.eventsGateway.emitToOrg(job.orgId, 'developer.email.status', {
            id: log.id,
            messageId: log.messageId,
            status: log.status,
            errorMessage: log.errorMessage,
          });
        }
        return;
      }
    }

    const payload: QueuedEmailJob = {
      ...job,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
    };

    if (this.bullQueue) {
      try {
        await this.withTimeout(
          this.bullQueue.add('dispatch', payload, {
            attempts: MAX_ATTEMPTS,
            backoff: { type: 'exponential', delay: 10000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          }),
          ENQUEUE_TIMEOUT_MS,
        );
        return;
      } catch (err) {
        this.logger.error(
          `Redis enqueue failed, keeping job in memory: ${(err as Error).message}`,
        );
      }
    }

    this.memoryQueue.push(payload);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${ms}ms`)),
        ms,
      );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  /** BullMQ worker entry. Throwing on a transient failure makes BullMQ retry with its backoff. */
  private async processBullJob(bullJob: Job<QueuedEmailJob>) {
    const data: QueuedEmailJob = {
      ...bullJob.data,
      attempts: bullJob.attemptsMade + 1,
      maxAttempts: MAX_ATTEMPTS,
    };
    const outcome = await this.dispatchJob(data);
    if (outcome === 'retry') {
      throw new Error(
        `Dispatch attempt ${data.attempts} failed for ${data.messageId}`,
      );
    }
  }

  /** In-memory loop: up to 5 jobs at a time. */
  private async processNextBatch() {
    if (this.isProcessing || this.memoryQueue.length === 0) return;
    this.isProcessing = true;
    try {
      const batch = this.memoryQueue.splice(0, 5);
      await Promise.allSettled(batch.map((job) => this.runMemoryJob(job)));
    } finally {
      this.isProcessing = false;
    }
  }

  private async runMemoryJob(job: QueuedEmailJob) {
    job.attempts += 1;
    const outcome = await this.dispatchJob(job);
    if (outcome === 'retry') {
      // Exponential backoff: re-queue after delay (10s, 60s)
      const delayMs = job.attempts === 1 ? 10000 : 60000;
      this.logger.warn(
        `Dispatch attempt ${job.attempts} failed for ${job.messageId}. Retrying in ${delayMs / 1000}s`,
      );
      setTimeout(() => this.memoryQueue.push(job), delayMs);
    }
  }

  /** One send attempt. `job.attempts` must already include this attempt. */
  private async dispatchJob(job: QueuedEmailJob): Promise<DispatchOutcome> {
    const cleanSubject = sanitizeHeader(job.subject);
    const cleanRecipients = sanitizeRecipients(job.to);
    const primaryRecipient = cleanRecipients[0];

    // RFC 8058 One-Click Unsubscribe Token & Link
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const unsubToken = this.complianceService.generateUnsubscribeToken(
      primaryRecipient,
      job.orgId,
    );
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
      undefined,
      undefined,
      job.businessUnitId ?? null,
    );

    const log = await this.emailLogRepo.findOne({
      where: { messageId: job.messageId },
    });

    if (sent) {
      if (log) {
        log.status = 'delivered';
        log.deliveredAt = new Date();
        await this.emailLogRepo.save(log);
        this.eventsGateway.emitToOrg(job.orgId, 'developer.email.status', {
          id: log.id,
          messageId: log.messageId,
          status: log.status,
          deliveredAt: log.deliveredAt,
        });
      }
      void this.emitWebhook(job.orgId, 'email.delivered', {
        id: job.messageId,
        recipient: primaryRecipient,
        subject: cleanSubject,
        deliveredAt: new Date().toISOString(),
      });
      return 'delivered';
    }

    if (job.attempts < job.maxAttempts) {
      return 'retry';
    }

    this.logger.error(
      `Dispatch permanently failed for ${job.messageId} after ${job.attempts} attempts`,
    );
    if (log) {
      log.status = 'failed';
      log.errorMessage = 'SMTP delivery failed after max retries';
      await this.emailLogRepo.save(log);
      this.eventsGateway.emitToOrg(job.orgId, 'developer.email.status', {
        id: log.id,
        messageId: log.messageId,
        status: log.status,
        errorMessage: log.errorMessage,
      });
    }
    void this.emitWebhook(job.orgId, 'email.bounced', {
      id: job.messageId,
      recipient: primaryRecipient,
      subject: cleanSubject,
      error: 'SMTP delivery failed',
      failedAt: new Date().toISOString(),
    });
    return 'failed';
  }

  /**
   * Emit HMAC-SHA256 signed webhook event to developer endpoints.
   */
  async emitWebhook(
    orgId: number,
    event: string,
    payload: Record<string, any>,
  ) {
    try {
      const endpoints = await this.webhookRepo.find({
        where: { organizationId: orgId, isActive: true },
      });

      const matched = endpoints.filter(
        (ep) => ep.events.includes(event) || ep.events.includes('*'),
      );

      for (const ep of matched) {
        const bodyStr = JSON.stringify({
          event,
          data: payload,
          timestamp: Date.now(),
        });
        const signature = createHmac('sha256', ep.secret)
          .update(bodyStr)
          .digest('hex');

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
          this.logger.warn(
            `Failed to deliver webhook to ${ep.url}: ${err.message}`,
          );
        });
      }
    } catch (err) {
      this.logger.error('Webhook emitter error', err);
    }
  }
}
