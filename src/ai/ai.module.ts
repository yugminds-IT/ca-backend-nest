import { BillingModule } from '../billing/billing.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead, LeadActivity, LeadTask } from '../entities/crm.entities';
import { BusinessUnit } from '../entities/business-unit.entity';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadActivity, LeadTask, BusinessUnit]), BillingModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
