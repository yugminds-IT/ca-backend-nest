import { BillingModule } from '../billing/billing.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from '../entities/business-unit.entity';
import { OrgUnit } from '../entities/org-unit.entity';
import { Organization } from '../entities/organization.entity';
import { BusinessUnitsService } from './business-units.service';
import { BusinessUnitsController } from './business-units.controller';
import { OrgUnitsService } from './org-units.service';
import { OrgUnitsController } from './org-units.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessUnit, OrgUnit, Organization]), BillingModule],
  controllers: [BusinessUnitsController, OrgUnitsController],
  providers: [BusinessUnitsService, OrgUnitsService],
  exports: [BusinessUnitsService, OrgUnitsService],
})
export class BusinessUnitsModule {}
