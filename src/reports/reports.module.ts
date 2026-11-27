import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from '../entities/crm.entities';
import { Dashboard, ReportSchedule } from '../entities/reports.entities';
import { EmailLog } from '../entities/email-log.entity';
import { FormSubmission } from '../entities/form-submission.entity';
import { BusinessUnit } from '../entities/business-unit.entity';
import { User } from '../entities/user.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportsJobsService } from './reports-jobs.service';

/** Standard reports, dashboards and scheduled report emails. Figures always follow the viewer's data scope. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead,
      Dashboard,
      ReportSchedule,
      EmailLog,
      FormSubmission,
      BusinessUnit,
      User,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsJobsService],
  exports: [ReportsService],
})
export class ReportsModule {}
