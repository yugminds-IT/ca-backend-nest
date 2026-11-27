import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Form } from '../entities/form.entity';
import { ApiKey } from '../entities/api-key.entity';
import { Organization } from '../entities/organization.entity';
import { BusinessUnitsModule } from '../business-units/business-units.module';
import { DeveloperModule } from '../developer/developer.module';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Form, ApiKey, Organization]),
    BusinessUnitsModule,
    DeveloperModule,
  ],
  controllers: [FormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
