import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { Client } from '../entities/client.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { Organization } from '../entities/organization.entity';
import { Service } from '../entities/service.entity';
import { ClientDirector } from '../entities/client-director.entity';
import { Segment } from '../entities/segment.entity';
import { SegmentsService } from './segments.service';
import { SegmentsController } from './segments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Client, User, Role, Organization, Service, ClientDirector, Segment])],
  controllers: [ClientsController, SegmentsController],
  providers: [ClientsService, SegmentsService],
  exports: [ClientsService, SegmentsService],
})
export class ClientsModule {}
