import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead, LeadTask } from '../entities/crm.entities';
import { Client } from '../entities/client.entity';
import { Contact } from '../entities/contact.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadTask, Client, Contact])],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
