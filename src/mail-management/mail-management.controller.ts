import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { MailManagementService } from './mail-management.service';
import { ScheduleEmailDto } from './dto/schedule-email.dto';

@Controller('mail-management')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
export class MailManagementController {
  constructor(private service: MailManagementService) {}

  /** Client emails + director emails (+ org user emails for master admin) for dropdown */
  @Get('recipients')
  getRecipients(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    const orgId = organizationId != null ? parseInt(organizationId, 10) : undefined;
    return this.service.getRecipients(user, orgId);
  }

  /** Master admin only: list org user emails (org mails) for sending */
  @Get('org-mails')
  @Roles(RoleName.MASTER_ADMIN)
  getOrgMails(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    const orgId = organizationId != null ? parseInt(organizationId, 10) : undefined;
    return this.service.getOrgMails(user, orgId);
  }

  /** Templates available for sending: master = only global; org = global + org's own */
  @Get('templates')
  getTemplatesForSending(@CurrentUser() user: User) {
    return this.service.getTemplatesForSending(user);
  }

  @Post('schedule')
  createSchedule(@Body() dto: ScheduleEmailDto, @CurrentUser() user: User) {
    return this.service.createSchedule(dto, user);
  }

  @Get('schedules')
  listSchedules(
    @CurrentUser() user: User,
    @Query('status') status?: 'pending' | 'sent' | 'failed' | 'cancelled',
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = organizationId != null ? parseInt(organizationId, 10) : undefined;
    return this.service.listSchedules(user, status, orgId);
  }

  @Get('schedules/:id')
  getSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.getSchedule(id, user);
  }

  @Delete('schedules/:id')
  cancelSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.cancelSchedule(id, user);
  }
}
