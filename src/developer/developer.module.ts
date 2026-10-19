import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from '../entities/api-key.entity';
import { EmailLog } from '../entities/email-log.entity';
import { FormSubmission } from '../entities/form-submission.entity';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { Organization } from '../entities/organization.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { Client } from '../entities/client.entity';
import { User } from '../entities/user.entity';
import { EmailModule } from '../email/email.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { DeveloperService } from './developer.service';
import { DeveloperController } from './developer.controller';
import { EmailDispatchQueueService } from './queue/email-dispatch-queue.service';
import { BotShieldService } from '../common/services/bot-shield.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiKey,
      EmailLog,
      FormSubmission,
      WebhookEndpoint,
      Organization,
      EmailTemplate,
      Client,
      User,
    ]),
    EmailModule,
    ComplianceModule,
  ],
  controllers: [DeveloperController],
  providers: [DeveloperService, EmailDispatchQueueService, BotShieldService],
  exports: [DeveloperService, EmailDispatchQueueService],
})
export class DeveloperModule {}
