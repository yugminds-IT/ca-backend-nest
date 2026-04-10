import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
  Res,
  ParseIntPipe,
  DefaultValuePipe,
  Optional,
} from '@nestjs/common';
import { Response } from 'express';
import { MasterAdminService } from './master-admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RoleName } from '../common/enums/role.enum';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ExtendOrgAccessDto } from './dto/extend-org-access.dto';

@Controller('master-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.MASTER_ADMIN)
export class MasterAdminController {
  constructor(
    private readonly masterAdminService: MasterAdminService,
    @Optional() private readonly activityLogService?: ActivityLogService,
  ) {}

  /** Dashboard KPI counts: total users, orgs, templates + monthly chart data */
  @Get('stats')
  getStats() {
    return this.masterAdminService.getStats();
  }

  /** Recent system activity derived from users, orgs, and email schedules */
  @Get('activity')
  getActivity(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.masterAdminService.getActivity(limit);
  }

  /** Aggregated analytics: user growth, email stats, monthly chart, role breakdown */
  @Get('analytics')
  getAnalytics() {
    return this.masterAdminService.getAnalytics();
  }

  /** Notifications feed derived from recent system events */
  @Get('notifications')
  getNotifications(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.masterAdminService.getNotifications(limit);
  }

  /** Export all users as CSV */
  @Get('export/users')
  async exportUsers(@Res() res: Response) {
    const csv = await this.masterAdminService.exportUsersCsv();
    const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /** Paginated activity logs: login, logout, errors, backend mutations */
  @Get('activity-logs')
  getActivityLogs(
    @Query('type') type: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('since') since?: string,
  ) {
    return this.activityLogService?.findAll({
      type,
      limit,
      offset,
      since: since ? new Date(since) : undefined,
    }) ?? { logs: [], total: 0 };
  }

  /** Pending self-service organization signups (awaiting approval) */
  @Get('organizations/pending')
  listPendingOrganizations() {
    return this.masterAdminService.listPendingOrganizations();
  }

  @Post('organizations/:id/approve')
  approveOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.masterAdminService.approveOrganization(id);
  }

  @Post('organizations/:id/reject')
  rejectOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.masterAdminService.rejectOrganization(id);
  }

  @Patch('organizations/:id/access')
  extendOrganizationAccess(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendOrgAccessDto,
  ) {
    return this.masterAdminService.extendOrganizationAccess(id, new Date(dto.accessUntil));
  }

  /** Export all organizations as CSV */
  @Get('export/organizations')
  async exportOrganizations(@Res() res: Response) {
    const csv = await this.masterAdminService.exportOrganizationsCsv();
    const filename = `organizations-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
