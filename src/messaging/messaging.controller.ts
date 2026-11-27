import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './messaging.dto';

const STAFF = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...STAFF)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  /** Which channels this deployment can send on. */
  @Get('status')
  @Require('leads.view')
  status() {
    return this.messaging.status();
  }

  @Post('leads/:id')
  @Require('leads.edit')
  send(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SendMessageDto,
  ) {
    return this.messaging.send(user, id, body.channel, body.body);
  }
}
