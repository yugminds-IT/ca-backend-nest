import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterAdminController } from './master-admin.controller';
import { MasterAdminService } from './master-admin.service';
import { PendingOrganizationsCronService } from './pending-orgs-cron.service';
import { User } from '../entities/user.entity';
import { Organization } from '../entities/organization.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { EmailSchedule } from '../entities/email-schedule.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Organization, EmailTemplate, EmailSchedule]),
  ],
  controllers: [MasterAdminController],
  providers: [MasterAdminService, PendingOrganizationsCronService],
})
export class MasterAdminModule {}
