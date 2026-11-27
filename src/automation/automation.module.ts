import { BillingModule } from '../billing/billing.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from '../entities/business-unit.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { Lead, LeadActivity, LeadTask } from '../entities/crm.entities';
import { Team } from '../entities/team.entity';
import { User } from '../entities/user.entity';
import { UserBusinessUnit } from '../entities/user-business-unit.entity';
import { UserOrgUnit } from '../entities/org-unit.entity';
import {
  AssignmentRule,
  ScoringRule,
  Sequence,
  SequenceEnrollment,
  SlaPolicy,
  WorkflowRule,
  WorkflowRun,
} from '../entities/automation.entities';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { AutomationJobsService } from './automation-jobs.service';
import { LeadActionsService } from './lead-actions.service';
import { SequenceRunnerService } from './sequence-runner.service';
import { WorkflowRunnerService } from './workflow-runner.service';

/**
 * Automation. Imports no lead or developer module: LeadsService and DeveloperService import this module,
 * and the mail sender is reached through a token at call time (see automation.tokens.ts).
 */
@Module({
  imports: [
    BillingModule,
    TypeOrmModule.forFeature([
      AssignmentRule,
      WorkflowRule,
      WorkflowRun,
      Sequence,
      SequenceEnrollment,
      SlaPolicy,
      ScoringRule,
      Lead,
      LeadActivity,
      LeadTask,
      User,
      Team,
      UserBusinessUnit,
      UserOrgUnit,
      BusinessUnit,
      EmailTemplate,
    ]),
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    LeadActionsService,
    SequenceRunnerService,
    WorkflowRunnerService,
    AutomationJobsService,
  ],
  exports: [AutomationService],
})
export class AutomationModule {}
