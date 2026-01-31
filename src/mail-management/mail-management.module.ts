import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { ClientDirector } from '../entities/client-director.entity';
import { EmailSchedule } from '../entities/email-schedule.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { MailManagementService } from './mail-management.service';
import { MailManagementController } from './mail-management.controller';
import { EmailScheduleProcessor } from './email-schedule.processor';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, ClientDirector, EmailSchedule, EmailTemplate, Organization, User]),
    EmailTemplatesModule,
  ],
  controllers: [MailManagementController],
  providers: [MailManagementService, EmailScheduleProcessor],
  exports: [MailManagementService],
})
export class MailManagementModule {}
