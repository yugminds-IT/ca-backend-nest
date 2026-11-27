import { BillingModule } from '../billing/billing.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { Lead } from '../entities/crm.entities';
import { StaffInvite } from '../entities/staff-invite.entity';
import { UserBusinessUnit } from '../entities/user-business-unit.entity';
import { UserOrgUnit } from '../entities/org-unit.entity';
import { BusinessUnitsModule } from '../business-units/business-units.module';
import { EmailModule } from '../email/email.module';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';

@Module({
  imports: [
    BillingModule,
    TypeOrmModule.forFeature([User, Role, Lead, StaffInvite, UserBusinessUnit, UserOrgUnit]),
    BusinessUnitsModule,
    EmailModule,
  ],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
