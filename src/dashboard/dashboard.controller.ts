import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('stats')
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  getStats(@CurrentUser() user: User) {
    return this.service.getStats(user);
  }
}
