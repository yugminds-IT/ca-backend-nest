import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { Organization } from '../entities/organization.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
