import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { FormsService } from './forms.service';
import { CreateFormDto, UpdateFormDto } from './dto/form.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiRateLimitGuard } from '../common/guards/api-rate-limit.guard';
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

@Controller()
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  // ------------------------------------------------------------- Staff: builder
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(...STAFF)
  @Require('forms.manage')
  @Get('forms')
  list(
    @CurrentUser() user: User,
    @Query('businessUnitId') businessUnitId?: string,
  ) {
    return this.forms.list(user, businessUnitId ? Number(businessUnitId) : undefined);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(...STAFF)
  @Require('forms.manage')
  @Post('forms')
  create(@CurrentUser() user: User, @Body() dto: CreateFormDto) {
    return this.forms.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(...STAFF)
  @Require('forms.manage')
  @Patch('forms/:id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.forms.update(user, Number(id), dto);
  }

  // ------------------------------------------------------------- Public: hosted form
  @Public()
  @Get('api/v1/f/:slug')
  getPublic(@Param('slug') slug: string) {
    return this.forms.getPublic(slug);
  }

  @Public()
  @UseGuards(ApiRateLimitGuard)
  @UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
  @Post('api/v1/f/:slug/submit')
  submit(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers('origin') origin: string | undefined,
    @Headers('referer') referer: string | undefined,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;
    return this.forms.submit(slug, body, { origin, referer, ip });
  }
}
