import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { ClientDirector } from '../entities/client-director.entity';
import { EmailSchedule } from '../entities/email-schedule.entity';
import { EmailDraft } from '../entities/email-draft.entity';
import { EmailDelivery } from '../entities/email-delivery.entity';
import { DraftsService } from './drafts.service';
import { EmailRecurringSchedule } from '../entities/email-recurring-schedule.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { MailManagementService } from './mail-management.service';
import { MailManagementController } from './mail-management.controller';
import { EmailScheduleProcessor } from './email-schedule.processor';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { CustomVariablesModule } from '../custom-variables/custom-variables.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client, ClientDirector, EmailSchedule, EmailDraft, EmailDelivery, EmailRecurringSchedule, EmailTemplate, Organization, User]),
    EmailTemplatesModule,
    CustomVariablesModule,
    ComplianceModule,
    ClientsModule,
  ],
  controllers: [MailManagementController],
  providers: [MailManagementService, EmailScheduleProcessor, DraftsService],
  exports: [MailManagementService],
})
export class MailManagementModule {}
