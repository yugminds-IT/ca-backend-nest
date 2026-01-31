import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientFilesService } from './client-files.service';
import { ClientFilesController } from './client-files.controller';
import { ClientFile } from '../entities/client-file.entity';
import { Client } from '../entities/client.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ClientFile, Client])],
  controllers: [ClientFilesController],
  providers: [ClientFilesService],
  exports: [ClientFilesService],
})
export class ClientFilesModule {}
