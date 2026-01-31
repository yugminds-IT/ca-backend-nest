import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { BusinessTypesService } from './business-types.service';
import { CreateBusinessTypeDto } from './dto/create-business-type.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Controller('business-types')
@UseGuards(JwtAuthGuard)
export class BusinessTypesController {
  constructor(private businessTypes: BusinessTypesService) {}

  @Get()
  findAll(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    return this.businessTypes.findAll(user, organizationId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  createCustom(@Body() dto: CreateBusinessTypeDto, @CurrentUser() user: User) {
    return this.businessTypes.createCustom(dto, user);
  }
}
