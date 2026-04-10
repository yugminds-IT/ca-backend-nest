import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MasterAdminService } from './master-admin.service';

@Injectable()
export class PendingOrganizationsCronService {
  private readonly logger = new Logger(PendingOrganizationsCronService.name);

  constructor(private readonly masterAdminService: MasterAdminService) {}

  /** Email the team a daily summary of pending organization registrations (08:00 IST). */
  @Cron('0 8 * * *', { timeZone: 'Asia/Kolkata' })
  async sendPendingDigest(): Promise<void> {
    try {
      await this.masterAdminService.sendDailyPendingDigestEmail();
    } catch (err) {
      this.logger.error('sendDailyPendingDigestEmail failed', err);
    }
  }
}
