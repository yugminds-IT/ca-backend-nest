import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { ClientCustomValue, CustomVariable } from '../entities/custom-variable.entity';
import { CustomVariablesController } from './custom-variables.controller';
import { CustomVariablesService } from './custom-variables.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomVariable, ClientCustomValue, Client])],
  controllers: [CustomVariablesController],
  providers: [CustomVariablesService],
  exports: [CustomVariablesService],
})
export class CustomVariablesModule {}
