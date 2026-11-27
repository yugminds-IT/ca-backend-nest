import { PlanGuard, Entitle } from '../billing/plan.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoleName } from '../common/enums/role.enum';
import { User } from '../entities/user.entity';
import { AutomationService } from './automation.service';
import {
  AssignmentRuleDto,
  EnrollDto,
  LeadEmailDto,
  ScoringRuleDto,
  SequenceDto,
  SlaPolicyDto,
  WorkflowRuleDto,
} from './automation.dto';

const STAFF = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

/** Optional organization for master admins. Everyone else uses their own. */
type OrgQuery = { organizationId?: string };
function orgOf(q: OrgQuery): number | undefined {
  if (q.organizationId === undefined || q.organizationId === '') return undefined;
  const n = Number(q.organizationId);
  return Number.isInteger(n) ? n : undefined;
}

@Controller('automation')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...STAFF)
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get('catalog')
  @Require('automation.manage')
  catalog() {
    return this.automation.catalog();
  }

  // ------------------------------------------------------------ assignment

  @Get('assignment-rules')
  @Require('automation.manage')
  listAssignment(@CurrentUser() user: User, @Query() q: OrgQuery & { businessUnitId: string }) {
    return this.automation.listAssignmentRules(user, orgOf(q), Number(q.businessUnitId));
  }

  @Post('assignment-rules')
  @UseGuards(PlanGuard)
  @Entitle({ feature: 'automations' })
  @Require('automation.manage')
  createAssignment(@CurrentUser() user: User, @Query() q: OrgQuery, @Body() dto: AssignmentRuleDto) {
    return this.automation.saveAssignmentRule(user, orgOf(q), null, dto);
  }

  @Put('assignment-rules/:id')
  @Require('automation.manage')
  updateAssignment(
    @CurrentUser() user: User,
    @Query() q: OrgQuery,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignmentRuleDto,
  ) {
    return this.automation.saveAssignmentRule(user, orgOf(q), id, dto);
  }

  @Delete('assignment-rules/:id')
  @HttpCode(204)
  @Require('automation.manage')
  async removeAssignment(@CurrentUser() user: User, @Query() q: OrgQuery, @Param('id', ParseIntPipe) id: number) {
    await this.automation.deleteAssignmentRule(user, orgOf(q), id);
  }

  // ------------------------------------------------------------ workflows

  @Get('workflows')
  @Require('automation.manage')
  listWorkflows(@CurrentUser() user: User, @Query() q: OrgQuery & { businessUnitId?: string }) {
    const unit = q.businessUnitId ? Number(q.businessUnitId) : undefined;
    return this.automation.listWorkflows(user, orgOf(q), unit);
  }

  @Post('workflows')
  @UseGuards(PlanGuard)
  @Entitle({ feature: 'automations' })
  @Require('automation.manage')
  createWorkflow(@CurrentUser() user: User, @Query() q: OrgQuery, @Body() dto: WorkflowRuleDto) {
    return this.automation.saveWorkflow(user, orgOf(q), null, dto);
  }

  @Put('workflows/:id')
  @Require('automation.manage')
  updateWorkflow(@CurrentUser() user: User, @Query() q: OrgQuery, @Param('id', ParseIntPipe) id: number, @Body() dto: WorkflowRuleDto) {
    return this.automation.saveWorkflow(user, orgOf(q), id, dto);
  }

  @Delete('workflows/:id')
  @HttpCode(204)
  @Require('automation.manage')
  async removeWorkflow(@CurrentUser() user: User, @Query() q: OrgQuery, @Param('id', ParseIntPipe) id: number) {
    await this.automation.deleteWorkflow(user, orgOf(q), id);
  }

  @Get('workflows/:id/runs')
  @Require('automation.manage')
  workflowRuns(@CurrentUser() user: User, @Query() q: OrgQuery, @Param('id', ParseIntPipe) id: number) {
    return this.automation.workflowRuns(user, orgOf(q), id);
  }

  // ------------------------------------------------------------ sequences

  @Get('sequences')
  @Require('automation.manage')
  listSequences(@CurrentUser() user: User, @Query() q: OrgQuery & { businessUnitId: string }) {
    return this.automation.listSequences(user, orgOf(q), Number(q.businessUnitId));
  }

  @Post('sequences')
  @UseGuards(PlanGuard)
  @Entitle({ feature: 'automations' })
  @Require('automation.manage')
  createSequence(@CurrentUser() user: User, @Query() q: OrgQuery, @Body() dto: SequenceDto) {
    return this.automation.saveSequence(user, orgOf(q), null, dto);
  }

  @Put('sequences/:id')
  @Require('automation.manage')
  updateSequence(@CurrentUser() user: User, @Query() q: OrgQuery, @Param('id', ParseIntPipe) id: number, @Body() dto: SequenceDto) {
    return this.automation.saveSequence(user, orgOf(q), id, dto);
  }

  @Delete('sequences/:id')
  @HttpCode(204)
  @Require('automation.manage')
  async removeSequence(@CurrentUser() user: User, @Query() q: OrgQuery, @Param('id', ParseIntPipe) id: number) {
    await this.automation.deleteSequence(user, orgOf(q), id);
  }

  @Get('sequences/:id/enrollments')
  @Require('automation.manage')
  sequenceEnrollments(@CurrentUser() user: User, @Query() q: OrgQuery, @Param('id', ParseIntPipe) id: number) {
    return this.automation.sequenceEnrollments(user, orgOf(q), id);
  }

  @Post('enrollments/:id/stop')
  @Require('leads.edit')
  async stopEnrollment(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this.automation.stopEnrollment(user, id);
    return { stopped: true };
  }

  // ------------------------------------------------------------ SLA and scoring

  @Get('sla-policy')
  @Require('automation.manage')
  getSla(@CurrentUser() user: User, @Query() q: OrgQuery & { businessUnitId: string }) {
    return this.automation.getSlaPolicy(user, orgOf(q), Number(q.businessUnitId));
  }

  @Put('sla-policy')
  @Require('automation.manage')
  saveSla(@CurrentUser() user: User, @Query() q: OrgQuery, @Body() dto: SlaPolicyDto) {
    return this.automation.saveSlaPolicy(user, orgOf(q), dto);
  }

  @Get('scoring-rules')
  @Require('automation.manage')
  listScoring(@CurrentUser() user: User, @Query() q: OrgQuery & { businessUnitId: string }) {
    return this.automation.listScoringRules(user, orgOf(q), Number(q.businessUnitId));
  }

  @Post('scoring-rules')
  @UseGuards(PlanGuard)
  @Entitle({ feature: 'automations' })
  @Require('automation.manage')
  createScoring(@CurrentUser() user: User, @Query() q: OrgQuery, @Body() dto: ScoringRuleDto) {
    return this.automation.saveScoringRule(user, orgOf(q), null, dto);
  }

  @Put('scoring-rules/:id')
  @Require('automation.manage')
  updateScoring(@CurrentUser() user: User, @Query() q: OrgQuery, @Param('id', ParseIntPipe) id: number, @Body() dto: ScoringRuleDto) {
    return this.automation.saveScoringRule(user, orgOf(q), id, dto);
  }

  @Delete('scoring-rules/:id')
  @HttpCode(204)
  @Require('automation.manage')
  async removeScoring(@CurrentUser() user: User, @Query() q: OrgQuery, @Param('id', ParseIntPipe) id: number) {
    await this.automation.deleteScoringRule(user, orgOf(q), id);
  }

  // ------------------------------------------------------------ per lead

  @Post('leads/:id/email')
  @Require('leads.edit')
  sendEmail(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() dto: LeadEmailDto) {
    return this.automation.sendLeadEmail(user, id, dto);
  }

  @Get('leads/:id/enrollments')
  @Require('leads.view')
  leadEnrollments(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.automation.listEnrollments(user, id);
  }

  @Post('leads/:id/enrollments')
  @UseGuards(PlanGuard)
  @Entitle({ feature: 'automations' })
  @Require('leads.edit')
  enroll(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() dto: EnrollDto) {
    return this.automation.enroll(user, id, dto.sequenceId);
  }
}
