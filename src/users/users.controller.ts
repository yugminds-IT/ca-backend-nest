import { Controller, Get, Post, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Post('employees')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN)
  createEmployee(@Body() dto: CreateEmployeeDto, @CurrentUser() user: User) {
    return this.users.createEmployee(dto, user);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  findAll(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    return this.users.findAll(user, organizationId);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.users.findOne(id, user);
  }
}
