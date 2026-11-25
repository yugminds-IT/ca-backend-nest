import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoleName } from '../common/enums/role.enum';
import { User } from '../entities/user.entity';
import { SaveSegmentDto, SegmentPreviewDto, SegmentsService, UpdateSegmentDto } from './segments.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
export class SegmentsController {
  constructor(private segments: SegmentsService) {}

  /** How many contacts match these rules, and the first page of them. */
  @Post('clients/segment')
  preview(@CurrentUser() user: User, @Body() dto: SegmentPreviewDto) {
    return this.segments.preview(user, dto);
  }

  @Get('segments')
  list(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    return this.segments.list(user, organizationId ? Number(organizationId) : undefined);
  }

  @Post('segments')
  create(@CurrentUser() user: User, @Body() dto: SaveSegmentDto, @Query('organizationId') organizationId?: string) {
    return this.segments.create(user, dto, organizationId ? Number(organizationId) : undefined);
  }

  @Patch('segments/:id')
  update(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSegmentDto) {
    return this.segments.update(user, id, dto);
  }

  @Delete('segments/:id')
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.segments.remove(user, id);
  }
}
