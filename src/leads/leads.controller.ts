import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import {
  CreateActivityDto,
  CreateLeadDto,
  CreateTaskDto,
  ImportLeadsDto,
  MoveLeadDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import { ListLeadsQuery } from './dto/list-leads.query';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

/** Staff who work leads. Client-portal users are excluded (see denyClients). */
const STAFF = [
  RoleName.MASTER_ADMIN,
  RoleName.ORG_ADMIN,
  RoleName.CAA,
  RoleName.ORG_EMPLOYEE,
];

@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...STAFF)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @Require('leads.view')
  list(@CurrentUser() user: User, @Query() query: ListLeadsQuery) {
    return this.leads.list(user, query);
  }

  /** Declared before ":id" so "duplicates" is not read as a lead id. */
  @Get('duplicates')
  @Require('leads.view')
  duplicates(
    @CurrentUser() user: User,
    @Query('businessUnitId', ParseIntPipe) businessUnitId: number,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
  ) {
    if (!email && !phone)
      throw new BadRequestException('Provide an email or phone to check');
    return this.leads.duplicatesFor(user, businessUnitId, email, phone);
  }

  /** Staff who can be assigned a lead. Declared before ':id'. */
  @Get('owners')
  @Require('leads.view')
  owners(
    @CurrentUser() user: User,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = organizationId != null ? Number(organizationId) : undefined;
    return this.leads.owners(user, Number.isInteger(orgId) ? orgId : undefined);
  }

  /** Bulk create from parsed CSV rows. Returns per-line results. */
  @Post('import')
  @Require('leads.import')
  import(@CurrentUser() user: User, @Body() dto: ImportLeadsDto) {
    return this.leads.importRows(user, dto);
  }

  @Post()
  @Require('leads.create')
  create(@CurrentUser() user: User, @Body() dto: CreateLeadDto) {
    return this.leads.create(user, dto);
  }

  @Get(':id')
  @Require('leads.view')
  get(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.leads.get(user, id);
  }

  @Patch(':id')
  @Require('leads.edit')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.update(user, id, dto);
  }

  @Post(':id/move')
  @Require('leads.edit')
  move(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveLeadDto,
  ) {
    return this.leads.move(user, id, dto);
  }

  @Post(':id/merge/:dropId')
  @Require('leads.delete')
  merge(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('dropId', ParseIntPipe) dropId: number,
  ) {
    return this.leads.merge(user, id, dropId);
  }

  @Get(':id/activities')
  @Require('leads.view')
  activities(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.leads.listActivities(user, id);
  }

  @Post(':id/activities')
  @Require('leads.edit')
  addActivity(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateActivityDto,
  ) {
    return this.leads.addActivity(user, id, dto);
  }

  @Post(':id/tasks')
  @Require('leads.edit')
  addTask(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTaskDto,
  ) {
    return this.leads.addTask(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Require('leads.delete')
  async remove(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.leads.remove(user, id);
  }
}

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...STAFF)
export class LeadTasksController {
  constructor(private readonly leads: LeadsService) {}

  /**
   * Filter by assignee, business unit and due date range. status: open (default), done, or all.
   * Due dates are ISO strings; the range is [dueFrom, dueTo).
   */
  @Get()
  @Require('leads.view')
  list(
    @CurrentUser() user: User,
    @Query('assignedToUserId') assignedToUserId?: string,
    @Query('status') status?: 'open' | 'done' | 'all',
    @Query('organizationId') organizationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('dueFrom') dueFrom?: string,
    @Query('dueTo') dueTo?: string,
  ) {
    const parseDate = (raw: string | undefined, name: string) => {
      if (raw === undefined) return undefined;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`${name} must be a date`);
      return d;
    };
    let unit: number | undefined;
    if (businessUnitId !== undefined) {
      unit = Number(businessUnitId);
      if (!Number.isInteger(unit) || unit <= 0) {
        throw new BadRequestException('businessUnitId must be a unit id');
      }
    }
    let assignee: number | undefined;
    if (assignedToUserId !== undefined) {
      assignee = Number(assignedToUserId);
      if (!Number.isInteger(assignee) || assignee <= 0) {
        throw new BadRequestException('assignedToUserId must be a user id');
      }
    }
    if (status !== undefined && !['open', 'done', 'all'].includes(status)) {
      throw new BadRequestException('status must be open, done or all');
    }
    return this.leads.listTasks(user, {
      assignedToUserId: assignee,
      status,
      organizationId: organizationId ? Number(organizationId) : undefined,
      businessUnitId: unit,
      dueFrom: parseDate(dueFrom, 'dueFrom'),
      dueTo: parseDate(dueTo, 'dueTo'),
    });
  }

  @Patch(':taskId')
  @Require('leads.edit')
  setDone(
    @CurrentUser() user: User,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() body: { done: boolean },
  ) {
    if (typeof body?.done !== 'boolean')
      throw new BadRequestException('done must be true or false');
    return this.leads.setTaskDone(user, taskId, body.done);
  }
}
