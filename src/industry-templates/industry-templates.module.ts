import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndustryTemplate } from '../entities/industry-template.entity';
import { IndustryTemplatesController } from './industry-templates.controller';
import { IndustryTemplatesService } from './industry-templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([IndustryTemplate])],
  controllers: [IndustryTemplatesController],
  providers: [IndustryTemplatesService],
  exports: [IndustryTemplatesService],
})
export class IndustryTemplatesModule {}
