import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { Organization } from '../entities/organization.entity';
import { EmailModule } from '../email/email.module';
import { BusinessUnitsModule } from '../business-units/business-units.module';

@Module({
  imports: [TypeOrmModule.forFeature([Organization]), EmailModule, BusinessUnitsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
