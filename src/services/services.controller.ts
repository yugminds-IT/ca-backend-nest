import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Controller('services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(private services: ServicesService) {}

  @Get()
  findAll(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    return this.services.findAll(user, organizationId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  createCustom(@Body() dto: CreateServiceDto, @CurrentUser() user: User) {
    return this.services.createCustom(dto, user);
  }
}
