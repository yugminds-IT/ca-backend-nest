import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuppressionList } from '../entities/suppression-list.entity';
import { Organization } from '../entities/organization.entity';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SuppressionList, Organization])],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
