import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { SmtpConfigDto, TestSmtpDto } from './dto/smtp-config.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private organizations: OrganizationsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN)
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: User) {
    return this.organizations.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.organizations.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.organizations.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: User,
  ) {
    return this.organizations.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.organizations.remove(id, user);
  }

  // ─── SMTP Config ──────────────────────────────────────────────────────────

  @Get(':id/smtp-config')
  getSmtpConfig(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.organizations.getSmtpConfig(id, user);
  }

  @Post(':id/smtp-config')
  saveSmtpConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SmtpConfigDto,
    @CurrentUser() user: User,
  ) {
    return this.organizations.saveSmtpConfig(id, dto, user);
  }

  @Delete(':id/smtp-config')
  clearSmtpConfig(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.organizations.clearSmtpConfig(id, user);
  }

  @Post(':id/smtp-config/test')
  testSmtpConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TestSmtpDto,
    @CurrentUser() user: User,
  ) {
    return this.organizations.testSmtpConfig(id, dto, user);
  }
}
