import { BillingModule } from '../billing/billing.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailAccount } from '../entities/mail-account.entity';
import { BusinessUnitsModule } from '../business-units/business-units.module';
import { MailAccountsController } from './mail-accounts.controller';
import { MailAccountsService } from './mail-accounts.service';

/** EmailService is global (EmailModule), so the service can use it without an import. */
@Module({
  imports: [TypeOrmModule.forFeature([MailAccount]), BusinessUnitsModule, BillingModule],
  controllers: [MailAccountsController],
  providers: [MailAccountsService],
  exports: [MailAccountsService],
})
export class MailAccountsModule {}
