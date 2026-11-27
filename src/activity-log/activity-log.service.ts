import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActivityLog } from '../entities/activity-log.entity';

const SIGN_IN_TYPES = ['login', 'login_failed', 'logout'];
const SIGN_IN_RETENTION_DAYS = 90;

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly repo: Repository<ActivityLog>,
  ) {}

  /**
   * Runs every hour. Deletes activity logs older than 48 hours, except sign-in events, which are kept
   * for 90 days so admins can review who signed in and when.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeOldLogs(): Promise<void> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const signInCutoff = new Date(Date.now() - SIGN_IN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const other = await this.repo
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoff', { cutoff })
      .andWhere('type NOT IN (:...signIn)', { signIn: SIGN_IN_TYPES })
      .execute();
    const signIns = await this.repo
      .createQueryBuilder()
      .delete()
      .where('createdAt < :signInCutoff', { signInCutoff })
      .andWhere('type IN (:...signIn)', { signIn: SIGN_IN_TYPES })
      .execute();
    const removed = (other.affected ?? 0) + (signIns.affected ?? 0);
    if (removed > 0) {
      this.logger.log(`Purged ${removed} activity log(s)`);
    }
  }

  /** Sign-in attempts and successful logins for one organization, newest first. */
  async listSignIns(orgId: number, opts: { userId?: number; limit?: number } = {}): Promise<ActivityLog[]> {
    const qb = this.repo
      .createQueryBuilder('l')
      .where('l.organizationId = :orgId', { orgId })
      .andWhere('l.type IN (:...signIn)', { signIn: SIGN_IN_TYPES })
      .orderBy('l.createdAt', 'DESC')
      .take(Math.min(Math.max(opts.limit ?? 100, 1), 500));
    if (opts.userId) qb.andWhere('l.userId = :userId', { userId: opts.userId });
    return qb.getMany();
  }

  /** Create a log entry. Never throws — logging must not break the main request. */
  async log(data: Partial<ActivityLog>): Promise<void> {
    try {
      await this.repo.save(this.repo.create(data));
    } catch {
      // intentionally silenced
    }
  }

  /** Find the most recent successful login for a given user (used to compute session duration on logout). */
  async getLastLogin(userId: number): Promise<ActivityLog | null> {
    return this.repo.findOne({
      where: { userId, type: 'login' },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(opts: {
    type?: string;
    limit?: number;
    offset?: number;
    since?: Date;
  }): Promise<{ logs: ActivityLog[]; total: number }> {
    const qb = this.repo.createQueryBuilder('l').orderBy('l.createdAt', 'DESC');

    if (opts.type && opts.type !== 'all') {
      qb.andWhere('l.type = :type', { type: opts.type });
    }
    if (opts.since) {
      qb.andWhere('l.createdAt > :since', { since: opts.since });
    }

    const total = await qb.getCount();
    qb.take(opts.limit ?? 100);
    if (opts.offset) qb.skip(opts.offset);
    const logs = await qb.getMany();
    return { logs, total };
  }
}
