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
import { PipelinesService } from './pipelines.service';
import { AddStageDto, CreatePipelineDto, ReorderStagesDto, UpdateStageDto } from './dto/lead.dto';
import { ApplyPipelineTemplateDto } from '../industry-templates/industry-templates.dto';
import { IndustryTemplatesService } from '../industry-templates/industry-templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

const ADMIN = [RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN];
const STAFF = [
  RoleName.MASTER_ADMIN,
  RoleName.ORG_ADMIN,
  RoleName.CAA,
  RoleName.ORG_EMPLOYEE,
];

@Controller('pipelines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PipelinesController {
  constructor(
    private readonly pipelines: PipelinesService,
    private readonly templates: IndustryTemplatesService,
  ) {}

  /** With businessUnitId, also creates the unit's default pipeline the first time. */
  @Get()
  @Roles(...STAFF)
  list(
    @CurrentUser() user: User,
    @Query('organizationId') organizationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
  ) {
    let unit: number | undefined;
    if (businessUnitId !== undefined) {
      unit = Number(businessUnitId);
      if (!Number.isInteger(unit) || unit <= 0)
        throw new BadRequestException('businessUnitId must be a unit id');
    }
    return this.pipelines.list(
      user,
      organizationId ? Number(organizationId) : undefined,
      unit,
    );
  }

  @Post()
  @Roles(...ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreatePipelineDto) {
    return this.pipelines.create(user, dto);
  }

  /** Creates a pipeline from an industry template's starter stages. The caller can rename it. */
  @Post('from-template')
  @Roles(...ADMIN)
  async createFromTemplate(@CurrentUser() user: User, @Body() dto: ApplyPipelineTemplateDto) {
    const template = await this.templates.get(dto.key);
    const stages: CreatePipelineDto['stages'] = template.pipelineStages.map((s) => ({
      name: s.name,
      probability: s.probability,
      isWon: s.isWon,
      isLost: s.isLost,
    }));
    return this.pipelines.create(user, {
      businessUnitId: dto.businessUnitId,
      name: dto.name?.trim() || template.name,
      stages,
    } as CreatePipelineDto);
  }

  @Post(':id/stages')
  @Roles(...ADMIN)
  addStage(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddStageDto,
  ) {
    return this.pipelines.addStage(user, id, dto);
  }

  @Patch(':id/stages/order')
  @Roles(...ADMIN)
  reorder(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReorderStagesDto,
  ) {
    return this.pipelines.reorder(user, id, dto);
  }

  @Patch('stages/:stageId')
  @Roles(...ADMIN)
  updateStage(
    @CurrentUser() user: User,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body() dto: UpdateStageDto,
  ) {
    return this.pipelines.updateStage(user, stageId, dto);
  }
}
