import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AUTH_LIMITS, AuthRateLimit, AuthRateLimitGuard } from '../common/guards/auth-rate-limit.guard';
import { StaffService } from './staff.service';
import { AcceptInviteDto, BulkInviteStaffDto, InviteStaffDto, UpdateStaffDto } from './dto/staff.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';
import { User } from '../entities/user.entity';

@Controller('staff')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @Require('staff.manage')
  list(@CurrentUser() user: User) {
    return this.staff.list(user);
  }

  @Post('invites')
  @Require('staff.manage')
  invite(@CurrentUser() user: User, @Body() dto: InviteStaffDto) {
    return this.staff.invite(user, dto);
  }

  /** Invite many people from a pasted CSV. Checked as a whole first; see staff.service inviteMany. */
  @Post('invites/bulk')
  @Require('staff.manage')
  inviteMany(@CurrentUser() user: User, @Body() dto: BulkInviteStaffDto) {
    return this.staff.inviteMany(user, dto);
  }

  /** Public: the invited person sets their password with the token from the email. */
  @Public()
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(...AUTH_LIMITS.invite)
  @Post('invites/accept')
  accept(@Body() dto: AcceptInviteDto) {
    return this.staff.acceptInvite(dto);
  }

  @Patch(':id')
  @Require('staff.manage')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(user, id, dto);
  }
}
