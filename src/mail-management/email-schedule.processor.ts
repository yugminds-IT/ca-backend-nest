import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailManagementService } from './mail-management.service';

@Injectable()
export class EmailScheduleProcessor {
  private readonly logger = new Logger(EmailScheduleProcessor.name);

  constructor(private mailManagement: MailManagementService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDueSchedules(): Promise<void> {
    try {
      const result = await this.mailManagement.processDueSchedules();
      if (result.processed > 0) {
        this.logger.log(
          `Processed ${result.processed} schedule(s), sent ${result.sent}, failed ${result.failed}`,
        );
      }
    } catch (err) {
      this.logger.error('Error processing due email schedules', err);
    }
  }
}
