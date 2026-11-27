import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OrgUnitsService } from './org-units.service';
import { CreateOrgUnitDto, UpdateOrgUnitDto } from './dto/org-unit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';

const STAFF = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

/** Units: the places a business operates from. Brands live inside them (see /business-units). */
@Controller('units')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class OrgUnitsController {
  constructor(private readonly units: OrgUnitsService) {}

  @Get()
  @Roles(...STAFF)
  list(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    const orgId = organizationId ? parseInt(organizationId, 10) : undefined;
    return this.units.list(user, Number.isNaN(orgId) ? undefined : orgId);
  }

  @Post()
  @Roles(...STAFF)
  @Require('units.manage')
  create(@CurrentUser() user: User, @Body() dto: CreateOrgUnitDto) {
    return this.units.create(user, dto);
  }

  @Patch(':id')
  @Roles(...STAFF)
  @Require('units.manage')
  update(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrgUnitDto) {
    return this.units.update(user, id, dto);
  }
}
