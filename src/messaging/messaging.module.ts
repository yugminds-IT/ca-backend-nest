import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead, LeadActivity } from '../entities/crm.entities';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadActivity])],
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
