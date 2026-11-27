import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BusinessUnitsService } from './business-units.service';
import {
  CreateBusinessUnitDto,
  UpdateBusinessUnitDto,
} from './dto/business-unit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';

const STAFF = [
  RoleName.MASTER_ADMIN,
  RoleName.ORG_ADMIN,
  RoleName.CAA,
  RoleName.ORG_EMPLOYEE,
];

@Controller('business-units')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class BusinessUnitsController {
  constructor(private readonly units: BusinessUnitsService) {}

  @Get()
  @Roles(...STAFF)
  list(
    @CurrentUser() user: User,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = organizationId ? parseInt(organizationId, 10) : undefined;
    return this.units.list(user, Number.isNaN(orgId) ? undefined : orgId);
  }

  @Post()
  @Roles(...STAFF)
  @Require('units.manage')
  create(@CurrentUser() user: User, @Body() dto: CreateBusinessUnitDto) {
    return this.units.create(user, dto);
  }

  @Patch(':id')
  @Roles(...STAFF)
  @Require('units.manage')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBusinessUnitDto,
  ) {
    return this.units.update(user, id, dto);
  }

  @Patch(':id/default')
  @Roles(...STAFF)
  @Require('units.manage')
  setDefault(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.units.setDefault(user, id);
  }
}
