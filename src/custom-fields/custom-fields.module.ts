import { BillingModule } from '../billing/billing.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CustomFieldDefinition,
  CustomVariable,
  CustomVariableValue,
} from '../entities/custom-fields.entities';
import { Client } from '../entities/client.entity';
import { BusinessUnitsModule } from '../business-units/business-units.module';
import { CustomFieldsService } from './custom-fields.service';
import { CustomVariablesService } from './custom-variables.service';
import { CustomFieldsController, CustomVariablesController } from './custom-fields.controller';

@Module({
  imports: [
    BillingModule,
    TypeOrmModule.forFeature([CustomFieldDefinition, CustomVariable, CustomVariableValue, Client]),
    BusinessUnitsModule,
  ],
  controllers: [CustomFieldsController, CustomVariablesController],
  providers: [CustomFieldsService, CustomVariablesService],
  exports: [CustomFieldsService, CustomVariablesService],
})
export class CustomFieldsModule {}
