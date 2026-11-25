import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoleName } from '../common/enums/role.enum';
import { User } from '../entities/user.entity';
import { CustomVariablesService } from './custom-variables.service';
import { CreateCustomVariableDto, SetClientValuesDto, UpdateCustomVariableDto } from './dto/custom-variable.dto';

@Controller('custom-variables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
export class CustomVariablesController {
  constructor(private service: CustomVariablesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.service.list(user);
  }

  @Post()
  create(@Body() dto: CreateCustomVariableDto, @CurrentUser() user: User) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomVariableDto, @CurrentUser() user: User) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.remove(user, id);
  }

  /** Set one client's values: { values: { meeting_link: "…" } } */
  @Put('clients/:clientId')
  setClientValues(@Param('clientId', ParseIntPipe) clientId: number, @Body() dto: SetClientValuesDto, @CurrentUser() user: User) {
    return this.service.setClientValues(user, clientId, dto.values);
  }
}
