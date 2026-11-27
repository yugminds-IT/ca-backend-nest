import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import { CustomVariablesService } from './custom-variables.service';
import {
  CreateCustomFieldDto,
  CreateCustomVariableDto,
  ReorderCustomFieldsDto,
  SetClientVariablesDto,
  UpdateCustomFieldDto,
  UpdateCustomVariableDto,
} from './dto/custom-field.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';

const STAFF = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

function parseOptionalInt(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestException(`${name} must be a positive integer`);
  return n;
}

@Controller('custom-fields')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CustomFieldsController {
  constructor(private readonly fields: CustomFieldsService) {}

  @Get()
  @Roles(...STAFF)
  list(
    @CurrentUser() user: User,
    @Query('organizationId') organizationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
  ) {
    return this.fields.list(
      user,
      parseOptionalInt(organizationId, 'organizationId'),
      parseOptionalInt(businessUnitId, 'businessUnitId'),
    );
  }

  @Post()
  @Roles(...STAFF)
  @Require('fields.manage')
  create(@CurrentUser() user: User, @Body() dto: CreateCustomFieldDto) {
    return this.fields.create(user, dto);
  }

  /** Declared before ":id" so "reorder" is not read as a field id. */
  @Post('reorder')
  @Roles(...STAFF)
  @Require('fields.manage')
  reorder(@CurrentUser() user: User, @Body() dto: ReorderCustomFieldsDto) {
    return this.fields.reorder(user, dto);
  }

  @Patch(':id')
  @Roles(...STAFF)
  @Require('fields.manage')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.fields.update(user, id, dto);
  }

  /** Removes the field and its values from the unit's leads. Turn it off instead to keep the data. */
  @Delete(':id')
  @Roles(...STAFF)
  @Require('fields.manage')
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.fields.remove(user, id).then(() => ({ deleted: true }));
  }
}

/** Variables used in email templates, e.g. {{meeting_link}}, with a value per client. */
@Controller('custom-variables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STAFF)
export class CustomVariablesController {
  constructor(private readonly variables: CustomVariablesService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('organizationId') organizationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
  ) {
    return this.variables.list(
      user,
      parseOptionalInt(organizationId, 'organizationId'),
      parseOptionalInt(businessUnitId, 'businessUnitId'),
    );
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateCustomVariableDto) {
    return this.variables.create(user, dto);
  }

  /** Declared before ":id" so "clients" is not read as a variable id. */
  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomVariableDto,
  ) {
    return this.variables.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.variables.remove(user, id).then(() => ({ deleted: true }));
  }

  /** Matches the frontend client: PUT /custom-variables/clients/:clientId with { values }. */
  @Put('clients/:clientId')
  setClientValues(
    @CurrentUser() user: User,
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() dto: SetClientVariablesDto,
  ) {
    return this.variables.setClientValues(user, clientId, dto.values);
  }
}
