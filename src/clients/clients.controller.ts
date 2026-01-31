import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateClientWithLoginDto } from './dto/create-client-with-login.dto';
import { OnboardClientDto } from './dto/onboard-client.dto';
import { CreateDirectorDto, UpdateDirectorDto } from './dto/onboard-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private clients: ClientsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  create(@Body() dto: CreateClientDto, @CurrentUser() user: User) {
    return this.clients.create(dto, user);
  }

  @Post('with-login')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  createWithLogin(@Body() dto: CreateClientWithLoginDto, @CurrentUser() user: User) {
    return this.clients.createWithLogin(dto, user);
  }

  @Post('onboard')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  onboard(@Body() dto: OnboardClientDto, @CurrentUser() user: User) {
    return this.clients.onboard(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    return this.clients.findAll(user, organizationId);
  }

  /** Static path (not :id) so this is never parsed as numeric id. */
  @Get('email-exists')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  checkLoginEmail(@Query('email') email: string, @Query('organizationId') organizationId?: string, @CurrentUser() user?: User) {
    return this.clients.checkLoginEmailExists(email?.trim(), organizationId, user!);
  }

  @Get(':clientId/directors')
  getDirectors(@Param('clientId', ParseIntPipe) clientId: number, @CurrentUser() user: User) {
    return this.clients.getDirectors(clientId, user);
  }

  @Post(':clientId/directors')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  addDirector(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() dto: CreateDirectorDto,
    @CurrentUser() user: User,
  ) {
    return this.clients.addDirector(clientId, dto, user);
  }

  @Patch(':clientId/directors/:directorId')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  updateDirector(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('directorId', ParseIntPipe) directorId: number,
    @Body() dto: UpdateDirectorDto,
    @CurrentUser() user: User,
  ) {
    return this.clients.updateDirector(clientId, directorId, dto, user);
  }

  @Delete(':clientId/directors/:directorId')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  removeDirector(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('directorId', ParseIntPipe) directorId: number,
    @CurrentUser() user: User,
  ) {
    return this.clients.removeDirector(clientId, directorId, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.clients.findOneForResponse(id, user);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClientDto, @CurrentUser() user: User) {
    return this.clients.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.clients.remove(id, user);
  }
}
