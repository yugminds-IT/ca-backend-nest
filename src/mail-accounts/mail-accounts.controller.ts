import {
  BadRequestException,
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
import { MailAccountsService } from './mail-accounts.service';
import {
  CreateMailAccountDto,
  UpdateMailAccountDto,
} from './dto/mail-account.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';

/** Sending accounts hold SMTP credentials. Staff need mail.manage; admins always have it. */
const STAFF = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

@Controller('mail-accounts')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MailAccountsController {
  constructor(private readonly accounts: MailAccountsService) {}

  /**
   * ?businessUnitId=<id> returns that unit's accounts. ?businessUnitId=org returns the
   * organization-wide account(s). Omit to return all.
   */
  @Get()
  @Roles(...STAFF)
  @Require('mail.manage')
  list(
    @CurrentUser() user: User,
    @Query('organizationId') organizationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
  ) {
    let unitFilter: number | null | undefined;
    if (businessUnitId === 'org') unitFilter = null;
    else if (businessUnitId !== undefined) {
      const parsed = Number(businessUnitId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new BadRequestException(
          'businessUnitId must be a unit id or "org"',
        );
      }
      unitFilter = parsed;
    }
    return this.accounts.list(
      user,
      this.parseOrgId(organizationId),
      unitFilter,
    );
  }

  @Post()
  @Roles(...STAFF)
  @Require('mail.manage')
  create(@CurrentUser() user: User, @Body() dto: CreateMailAccountDto) {
    return this.accounts.create(user, dto);
  }

  @Patch(':id')
  @Roles(...STAFF)
  @Require('mail.manage')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMailAccountDto,
  ) {
    return this.accounts.update(user, id, dto);
  }

  /** Deactivates the account. Mail then falls back to the next account in the chain. */
  @Post(':id/deactivate')
  @Roles(...STAFF)
  @Require('mail.manage')
  deactivate(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.accounts.deactivate(user, id);
  }

  /** Logs in to the SMTP server with the saved credentials. */
  @Post(':id/verify')
  @Roles(...STAFF)
  @Require('mail.manage')
  verify(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.accounts.verify(user, id);
  }

  private parseOrgId(raw?: string): number | undefined {
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(
        'organizationId must be a positive integer',
      );
    }
    return parsed;
  }
}
