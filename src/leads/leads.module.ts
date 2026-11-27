import { IndustryTemplatesModule } from '../industry-templates/industry-templates.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Lead,
  LeadActivity,
  LeadTask,
  Pipeline,
  PipelineStage,
} from '../entities/crm.entities';
import { User } from '../entities/user.entity';
import { BusinessUnitsModule } from '../business-units/business-units.module';
import { LeadsService } from './leads.service';
import { PipelinesService } from './pipelines.service';
import { LeadsController, LeadTasksController } from './leads.controller';
import { PipelinesController } from './pipelines.controller';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead,
      LeadActivity,
      LeadTask,
      Pipeline,
      PipelineStage,
      User,
    ]),
    BusinessUnitsModule,
    CustomFieldsModule,
    AutomationModule,
    IndustryTemplatesModule,
  ],
  controllers: [LeadsController, LeadTasksController, PipelinesController],
  providers: [LeadsService, PipelinesService],
  exports: [LeadsService, PipelinesService],
})
export class LeadsModule {}
