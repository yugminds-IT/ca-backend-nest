import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { Organization } from '../entities/organization.entity';
import { MailAccount } from '../entities/mail-account.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Organization, MailAccount])],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
