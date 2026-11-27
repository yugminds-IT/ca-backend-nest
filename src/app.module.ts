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
import { ReportsModule } from './reports/reports.module';
import { SearchModule } from './search/search.module';
import { AiModule } from './ai/ai.module';
import { MessagingModule } from './messaging/messaging.module';
import { IndustryTemplatesModule } from './industry-templates/industry-templates.module';
import { BillingModule } from './billing/billing.module';
import { OrgBilling } from './entities/org-billing.entity';
import { IndustryTemplate } from './entities/industry-template.entity';
import { Dashboard, ReportSchedule } from './entities/reports.entities';
import { TdsFilingModule } from './tds-filing/tds-filing.module';
import { TdsFilingSession } from './tds-filing/tds-filing-session.entity';
import { GstFilingModule } from './gst-filing/gst-filing.module';
import { GstFilingSession } from './gst-filing/gst-filing-session.entity';
import { DeveloperModule } from './developer/developer.module';
import { FormsModule } from './forms/forms.module';
import { AccessModule } from './access/access.module';
import { StaffModule } from './staff/staff.module';
import { PermissionProfile } from './entities/permission-profile.entity';
import { UserBusinessUnit } from './entities/user-business-unit.entity';
import { OrgUnit, UserOrgUnit } from './entities/org-unit.entity';
import { StaffInvite } from './entities/staff-invite.entity';
import { Team } from './entities/team.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { Form } from './entities/form.entity';
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
import { EmailRecurringSchedule } from './entities/email-recurring-schedule.entity';
import { ActivityLog } from './entities/activity-log.entity';
import { Notification } from './entities/notification.entity';
import { ApiKey } from './entities/api-key.entity';
import { EmailLog } from './entities/email-log.entity';
import { FormSubmission } from './entities/form-submission.entity';
import { Contact } from './entities/contact.entity';
import { ContactList } from './entities/contact-list.entity';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { SuppressionList } from './entities/suppression-list.entity';
import { WorkspaceFeature } from './entities/workspace-feature.entity';
import { BusinessUnit } from './entities/business-unit.entity';
import { BusinessUnitsModule } from './business-units/business-units.module';
import { MailAccount } from './entities/mail-account.entity';
import { MailAccountsModule } from './mail-accounts/mail-accounts.module';
import { LeadsModule } from './leads/leads.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import {
  CustomFieldDefinition,
  CustomVariable,
  CustomVariableValue,
} from './entities/custom-fields.entities';
import {
  Pipeline,
  PipelineStage,
  Lead,
  LeadActivity,
  LeadTask,
} from './entities/crm.entities';
import { ComplianceModule } from './compliance/compliance.module';
import { EventsModule } from './events/events.module';
import {
  AssignmentRule,
  WorkflowRule,
  WorkflowRun,
  Sequence,
  SequenceEnrollment,
  SlaPolicy,
  ScoringRule,
} from './entities/automation.entities';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Nest merges both files: `.env` values override the same keys in `.env.example`; keys only in `.env.example` are kept.
      envFilePath: ['.env', '.env.example'],
    }),
    ScheduleModule.forRoot(),
    EventsModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [
        Role,
        Organization,
        User,
        Client,
        BusinessType,
        Service,
        ClientDirector,
        Otp,
        ClientFile,
        EmailTemplate,
        EmailSchedule,
        EmailRecurringSchedule,
        ActivityLog,
        Notification,
        IndustryTemplate,
        OrgBilling,
        TdsFilingSession,
        GstFilingSession,
        ApiKey,
        Form,
        PermissionProfile,
        UserBusinessUnit,
        OrgUnit,
        UserOrgUnit,
        StaffInvite,
        Team,
        AuditEvent,
        EmailLog,
        FormSubmission,
        Contact,
        ContactList,
        WebhookEndpoint,
        SuppressionList,
        WorkspaceFeature,
        BusinessUnit,
        MailAccount,
        Pipeline,
        PipelineStage,
        Lead,
        LeadActivity,
        LeadTask,
        CustomFieldDefinition,
        CustomVariable,
        CustomVariableValue,
        AssignmentRule,
        WorkflowRule,
        WorkflowRun,
        Sequence,
        SequenceEnrollment,
        SlaPolicy,
        ScoringRule,
        Dashboard,
        ReportSchedule,
      ],
      synchronize: false,
      logging: false,
      retryAttempts: 5,
      retryDelay: 3000,
      extra: {
        // Pool sizing
        max: parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
        min: 1,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis:
          parseInt(process.env.DB_CONNECT_TIMEOUT ?? '10', 10) * 1000,
        // Keep idle connections alive — prevents remote DB from closing them
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        // SSL (required for Supabase / remote Postgres)
        ...(process.env.DB_SSL === 'true'
          ? { ssl: { rejectUnauthorized: false } }
          : {}),
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
    ReportsModule,
    SearchModule,
    AiModule,
    MessagingModule,
    IndustryTemplatesModule,
    BillingModule,
    TdsFilingModule,
    GstFilingModule,
    DeveloperModule,
    FormsModule,
    AccessModule,
    StaffModule,
    ComplianceModule,
    BusinessUnitsModule,
    MailAccountsModule,
    LeadsModule,
    CustomFieldsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
