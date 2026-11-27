import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportFilters, WidgetSpec } from './reports.rules';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

/** Staff who see reports. Client-portal users are excluded. */
const STAFF = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

type RawQuery = Record<string, string | undefined>;

/** Query-string filters. Invalid numbers stay invalid so the service reports them. */
function filtersFrom(q: RawQuery): ReportFilters {
  const num = (v?: string) => (v === undefined || v === '' ? null : Number(v));
  return {
    businessUnitId: num(q.businessUnitId),
    ownerUserId: num(q.ownerUserId),
    source: q.source ? q.source : null,
    from: q.from ? q.from : null,
    to: q.to ? q.to : null,
  };
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...STAFF)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // ---- standard pack

  @Get('standard')
  @Require('reports.view')
  standard(@CurrentUser() user: User, @Query() q: RawQuery) {
    return this.reports.standard(user, filtersFrom(q));
  }

  @Get('standard/export')
  @Require('reports.view')
  async standardExport(
    @CurrentUser() user: User,
    @Query() q: RawQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const format = q.format === 'csv' ? 'csv' : 'xlsx';
    const file = await this.reports.exportFile(user, { kind: 'standard' }, filtersFrom(q), format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return new StreamableFile(file.buffer);
  }

  // ---- widgets

  /** Computes one widget without saving it (used by the builder preview). */
  @Post('preview')
  @Require('reports.view')
  preview(@CurrentUser() user: User, @Body() body: { widget: WidgetSpec; filters?: ReportFilters }) {
    return this.reports.runWidget(user, body?.widget as WidgetSpec, body?.filters ?? {});
  }

  // ---- dashboards

  @Get('dashboards')
  @Require('reports.view')
  listDashboards(@CurrentUser() user: User) {
    return this.reports.listDashboards(user);
  }

  @Post('dashboards')
  @Require('reports.manage')
  createDashboard(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.reports.saveDashboard(user, null, body);
  }

  @Get('dashboards/:id')
  @Require('reports.view')
  getDashboard(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.reports.getDashboard(user, id);
  }

  @Put('dashboards/:id')
  @Require('reports.manage')
  updateDashboard(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.reports.saveDashboard(user, id, body);
  }

  @Delete('dashboards/:id')
  @Require('reports.manage')
  async deleteDashboard(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this.reports.deleteDashboard(user, id);
    return { deleted: true };
  }

  /** Every widget on a dashboard, computed for the viewer. Query filters override the dashboard's own. */
  @Get('dashboards/:id/data')
  @Require('reports.view')
  dashboardData(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: RawQuery,
  ) {
    return this.reports.dashboardData(user, id, this.overrides(q));
  }

  @Get('dashboards/:id/export')
  @Require('reports.view')
  async dashboardExport(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: RawQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const format = q.format === 'csv' ? 'csv' : 'xlsx';
    const file = await this.reports.exportFile(user, { kind: 'dashboard', id }, this.overrides(q), format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return new StreamableFile(file.buffer);
  }

  /** Only the filters the query actually sets, so the dashboard's saved filters stay in place otherwise. */
  private overrides(q: RawQuery): ReportFilters {
    const f = filtersFrom(q);
    const out: ReportFilters = {};
    (Object.keys(f) as Array<keyof ReportFilters>).forEach((k) => {
      if (q[k] !== undefined && q[k] !== '') (out as Record<string, unknown>)[k] = f[k];
    });
    return out;
  }

  // ---- scheduled emails

  @Get('schedules')
  @Require('reports.manage')
  listSchedules(@CurrentUser() user: User) {
    return this.reports.listSchedules(user);
  }

  @Post('schedules')
  @Require('reports.manage')
  createSchedule(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.reports.createSchedule(user, body);
  }

  @Put('schedules/:id')
  @Require('reports.manage')
  updateSchedule(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.reports.updateSchedule(user, id, body);
  }

  @Delete('schedules/:id')
  @Require('reports.manage')
  async deleteSchedule(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this.reports.deleteSchedule(user, id);
    return { deleted: true };
  }

  @Post('schedules/:id/send-now')
  @Require('reports.manage')
  sendNow(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.reports.sendNow(user, id);
  }
}
