import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    if (!user.organizationId) return { notifications: [], total: 0, unread: 0 };
    return this.service.findAll(
      user.organizationId,
      skip ? parseInt(skip, 10) : 0,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: User) {
    if (!user.organizationId) throw new ForbiddenException('No organization');
    await this.service.markAllRead(user.organizationId);
    return { message: 'All notifications marked as read' };
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    if (!user.organizationId) throw new ForbiddenException('No organization');
    return this.service.markRead(id, user.organizationId);
  }
}
