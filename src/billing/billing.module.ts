import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgBilling } from '../entities/org-billing.entity';
import { Organization } from '../entities/organization.entity';
import { BusinessUnit } from '../entities/business-unit.entity';
import { User } from '../entities/user.entity';
import { CustomFieldDefinition } from '../entities/custom-fields.entities';
import { BillingController, PublicPlansController } from './billing.controller';
import { BillingService } from './billing.service';
import { PlanGuard } from './plan.guard';

@Module({
  imports: [TypeOrmModule.forFeature([OrgBilling, Organization, BusinessUnit, User, CustomFieldDefinition])],
  controllers: [BillingController, PublicPlansController],
  providers: [BillingService, PlanGuard],
  exports: [BillingService, PlanGuard],
})
export class BillingModule {}
