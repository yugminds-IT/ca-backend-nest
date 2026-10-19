import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GstFilingSession } from './gst-filing-session.entity';
import { GstFilingService } from './gst-filing.service';
import { GstFilingController } from './gst-filing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GstFilingSession])],
  controllers: [GstFilingController],
  providers: [GstFilingService],
})
export class GstFilingModule {}
