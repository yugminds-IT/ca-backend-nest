import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { requireOrgScope } from '../leads/lead-scope.util';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AccessService, ProfileInput } from './access.service';
import { AuditService } from './audit.service';
import { TeamInput, TeamsService } from './teams.service';
import { PermissionsGuard } from './permissions.guard';
import { Require } from './require.decorator';
import { normalizeStructure } from '../organizations/unit-structure';
import { DATA_SCOPE_LABELS, PERMISSION_GROUPS } from './permissions';

const AUDIT_PREFIX = /^[a-z]{1,20}\.$/;

@Controller('access')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessController {
  constructor(
    private readonly access: AccessService,
    private readonly teams: TeamsService,
    private readonly audit: AuditService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /** What the signed-in user may do. Drives the navigation; the server still checks every request. */
  @Get('me')
  async me(@CurrentUser() user: User) {
    const ctx = await this.access.contextFor(user);
    return {
      permissions: [...ctx.permissions].sort(),
      dataScope: ctx.dataScope,
      unitIds: ctx.unitIds,
      /** False for a single-branch organization, so the app hides the brand (business unit) pages. */
      adminPanel: ctx.adminPanel,
      /** multi_unit, one_unit_multi_brand, one_unit_one_brand or one_unit_no_brand. */
      unitStructure: normalizeStructure(user.organization?.unitStructure),
    };
  }

  @Get('permissions')
  @Require('staff.manage')
  catalog() {
    return { groups: PERMISSION_GROUPS, dataScopes: DATA_SCOPE_LABELS };
  }

  @Get('profiles')
  @Require('staff.manage')
  profiles(@CurrentUser() user: User) {
    return this.access.listProfiles(user);
  }

  @Post('profiles')
  @Require('staff.manage')
  createProfile(@CurrentUser() user: User, @Body() body: ProfileInput) {
    return this.access.createProfile(user, body);
  }

  @Patch('profiles/:id')
  @Require('staff.manage')
  updateProfile(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ProfileInput,
  ) {
    return this.access.updateProfile(user, id, body);
  }

  @Delete('profiles/:id')
  @Require('staff.manage')
  deleteProfile(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.access.deleteProfile(user, id);
  }

  @Get('teams')
  @Require('staff.manage')
  listTeams(@CurrentUser() user: User) {
    return this.teams.list(user);
  }

  @Post('teams')
  @Require('staff.manage')
  createTeam(@CurrentUser() user: User, @Body() body: TeamInput) {
    return this.teams.create(user, body);
  }

  @Patch('teams/:id')
  @Require('staff.manage')
  updateTeam(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TeamInput,
  ) {
    return this.teams.update(user, id, body);
  }

  @Delete('teams/:id')
  @Require('staff.manage')
  async deleteTeam(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this.teams.remove(user, id);
    return { deleted: true };
  }

  /** Recent staff and access changes. Pass prefix=staff. / profile. / team. to narrow. */
  @Get('audit')
  @Require('staff.manage')
  auditTrail(
    @CurrentUser() user: User,
    @Query('prefix') prefix?: string,
    @Query('limit') limit?: string,
  ) {
    if (prefix && !AUDIT_PREFIX.test(prefix)) {
      throw new BadRequestException('prefix must look like staff. or team.');
    }
    const parsed = limit ? Number(limit) : undefined;
    return this.audit.list(requireOrgScope(user), {
      actionPrefix: prefix,
      limit: Number.isFinite(parsed) ? parsed : undefined,
    });
  }

  /** Sign-in attempts and logins for this organization. Pass userId to see one person. */
  @Get('sign-ins')
  @Require('staff.manage')
  signIns(
    @CurrentUser() user: User,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedUser = userId ? Number(userId) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.activityLog.listSignIns(requireOrgScope(user), {
      userId: Number.isInteger(parsedUser) ? parsedUser : undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }
}
