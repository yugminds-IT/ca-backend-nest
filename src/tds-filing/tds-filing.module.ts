import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TdsFilingSession } from './tds-filing-session.entity';
import { TdsFilingService } from './tds-filing.service';
import { TdsFilingController } from './tds-filing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TdsFilingSession])],
  controllers: [TdsFilingController],
  providers: [TdsFilingService],
})
export class TdsFilingModule {}
