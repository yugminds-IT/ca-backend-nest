import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { EmailSchedule } from '../entities/email-schedule.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Client, EmailSchedule, EmailTemplate])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
