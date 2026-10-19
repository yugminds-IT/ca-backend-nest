import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessTypesService } from './business-types.service';
import { BusinessTypesController } from './business-types.controller';
import { BusinessType } from '../entities/business-type.entity';
import { Organization } from '../entities/organization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessType, Organization])],
  controllers: [BusinessTypesController],
  providers: [BusinessTypesService],
  exports: [BusinessTypesService],
})
export class BusinessTypesModule {}
