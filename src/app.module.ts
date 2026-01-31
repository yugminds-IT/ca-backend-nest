import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ClientsModule } from './clients/clients.module';
import { UsersModule } from './users/users.module';
import { BusinessTypesModule } from './business-types/business-types.module';
import { ServicesModule } from './services/services.module';
import { EmailModule } from './email/email.module';
import { S3Module } from './s3/s3.module';
import { ClientFilesModule } from './client-files/client-files.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { MailManagementModule } from './mail-management/mail-management.module';
import { ScheduleModule } from '@nestjs/schedule';
import { Role } from './entities/role.entity';
import { Organization } from './entities/organization.entity';
import { User } from './entities/user.entity';
import { Client } from './entities/client.entity';
import { BusinessType } from './entities/business-type.entity';
import { Service } from './entities/service.entity';
import { ClientDirector } from './entities/client-director.entity';
import { Otp } from './entities/otp.entity';
import { ClientFile } from './entities/client-file.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailSchedule } from './entities/email-schedule.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Role, Organization, User, Client, BusinessType, Service, ClientDirector, Otp, ClientFile, EmailTemplate, EmailSchedule],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
      extra:
        process.env.DB_SSL === 'true'
          ? { ssl: { rejectUnauthorized: false } }
          : {
              max: parseInt(process.env.DB_POOL_SIZE ?? '20', 10),
              connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT ?? '10', 10) * 1000,
              statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT ?? '30', 10) * 1000,
            },
    }),
    EmailModule,
    S3Module,
    AuthModule,
    OrganizationsModule,
    ClientsModule,
    UsersModule,
    BusinessTypesModule,
    ServicesModule,
    ClientFilesModule,
    EmailTemplatesModule,
    MailManagementModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
