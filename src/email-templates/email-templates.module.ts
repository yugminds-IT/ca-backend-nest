import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate } from '../entities/email-template.entity';
import { EmailSchedule } from '../entities/email-schedule.entity';
import { Organization } from '../entities/organization.entity';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailModule } from '../email/email.module';
import { BusinessUnitsModule } from '../business-units/business-units.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailTemplate, EmailSchedule, Organization]),
    EmailModule,
    BusinessUnitsModule,
  ],
  controllers: [EmailTemplatesController],
  providers: [EmailTemplatesService],
  exports: [EmailTemplatesService],
})
export class EmailTemplatesModule {}
