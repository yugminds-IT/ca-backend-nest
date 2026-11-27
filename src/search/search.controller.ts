import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { SearchService } from './search.service';
import { GlobalSearchQuery } from './search.dto';

const STAFF = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...STAFF)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Global search. Client-portal users are refused by the role guard. */
  @Get()
  @Require('leads.view')
  find(@CurrentUser() user: User, @Query() query: GlobalSearchQuery) {
    return this.search.search(user, query);
  }
}
