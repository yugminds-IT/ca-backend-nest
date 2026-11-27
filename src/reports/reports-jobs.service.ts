import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReportsService } from './reports.service';

/**
 * Sends scheduled report emails. Runs every 15 minutes, so a schedule is sent within 15 minutes of its time.
 * A run still going when the next tick arrives is skipped, so runs never overlap in one process.
 */
@Injectable()
export class ReportsJobsService {
  private readonly logger = new Logger(ReportsJobsService.name);
  private running = false;

  constructor(private readonly reports: ReportsService) {}

  @Cron('*/15 * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { sent, failed } = await this.reports.runDueSchedules(new Date());
      if (sent || failed) this.logger.log(`Scheduled reports: sent ${sent}, failed ${failed}`);
    } catch (err) {
      this.logger.error(`Scheduled report run failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }
}
