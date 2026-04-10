import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { LoggingInterceptor } from './common/logging.interceptor';
import { ActivityLogModule } from './activity-log/activity-log.module';
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
import { MasterAdminModule } from './master-admin/master-admin.module';
import { ContactModule } from './contact/contact.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
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
import { ActivityLog } from './entities/activity-log.entity';
import { Notification } from './entities/notification.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Nest merges both files: `.env` values override the same keys in `.env.example`; keys only in `.env.example` are kept.
      envFilePath: ['.env', '.env.example'],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Role, Organization, User, Client, BusinessType, Service, ClientDirector, Otp, ClientFile, EmailTemplate, EmailSchedule, ActivityLog, Notification],
      synchronize: false,
      logging: false,
      retryAttempts: 5,
      retryDelay: 3000,
      extra: {
        // Pool sizing
        max: parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
        min: 1,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT ?? '10', 10) * 1000,
        // Keep idle connections alive — prevents remote DB from closing them
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        // SSL (required for Supabase / remote Postgres)
        ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
      },
    }),
    ActivityLogModule,
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
    MasterAdminModule,
    ContactModule,
    NotificationsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
