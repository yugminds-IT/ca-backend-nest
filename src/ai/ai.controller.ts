import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../access/permissions.guard';
import { Require } from '../access/require.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { AiService } from './ai.service';
import type { DraftTone } from './ai.rules';

const STAFF = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];

class DraftReplyDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  intent?: string;

  @IsOptional()
  @IsIn(['formal', 'friendly', 'brief'])
  tone?: DraftTone;
}

class CleanNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text: string;
}

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...STAFF)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @Require('leads.view')
  status() {
    return this.ai.status();
  }

  @Get('leads/:id/next-actions')
  @Require('leads.view')
  nextActions(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.ai.nextActions(user, id);
  }

  @Post('leads/:id/draft-reply')
  @Require('leads.view')
  draftReply(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: DraftReplyDto,
  ) {
    return this.ai.draftReply(user, id, body);
  }

  @Post('notes/clean')
  @Require('leads.edit')
  cleanNote(@CurrentUser() user: User, @Body() body: CleanNoteDto) {
    return this.ai.cleanNote(user, body.text);
  }
}
