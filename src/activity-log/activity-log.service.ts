import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActivityLog } from '../entities/activity-log.entity';

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly repo: Repository<ActivityLog>,
  ) {}

  /** Runs every hour — deletes activity logs older than 48 hours. */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeOldLogs(): Promise<void> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const result = await this.repo.delete({ createdAt: LessThan(cutoff) });
    if ((result.affected ?? 0) > 0) {
      this.logger.log(`Purged ${result.affected} activity log(s) older than 48 hours`);
    }
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
