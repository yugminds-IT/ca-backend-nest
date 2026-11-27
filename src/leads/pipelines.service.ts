import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Pipeline, PipelineStage } from '../entities/crm.entities';
import { User } from '../entities/user.entity';
import { AccessService } from '../access/access.service';
import { BusinessUnitsService } from '../business-units/business-units.service';
import { cannotTurnOffStage, DEFAULT_STAGES, insertPosition, StageOutcome } from './lead-normalize.util';
import {
  assertRecordInOrg,
  denyClients,
  requireOrgScope,
} from './lead-scope.util';
import { AddStageDto, CreatePipelineDto, ReorderStagesDto, UpdateStageDto } from './dto/lead.dto';

export interface PipelineView extends Pipeline {
  stages: PipelineStage[];
}

@Injectable()
export class PipelinesService {
  constructor(
    @InjectRepository(Pipeline)
    private readonly pipelines: Repository<Pipeline>,
    @InjectRepository(PipelineStage)
    private readonly stages: Repository<PipelineStage>,
    private readonly businessUnits: BusinessUnitsService,
    private readonly access: AccessService,
  ) {}

  /**
   * The unit's default pipeline, created with the standard stages when missing.
   * Safe to call repeatedly. The partial unique index keeps one default per unit.
   */
  async ensureDefault(orgId: number, unitId: number): Promise<Pipeline> {
    const existing = await this.pipelines.findOne({
      where: { organizationId: orgId, businessUnitId: unitId, isDefault: true },
    });
    if (existing) return existing;

    try {
      return await this.pipelines.manager.transaction(async (m) => {
        const pipeline = await m.getRepository(Pipeline).save(
          m.getRepository(Pipeline).create({
            organizationId: orgId,
            businessUnitId: unitId,
            name: 'Sales pipeline',
            isDefault: true,
          }),
        );
        await m.getRepository(PipelineStage).save(
          DEFAULT_STAGES.map((s, i) =>
            m.getRepository(PipelineStage).create({
              organizationId: orgId,
              pipelineId: pipeline.id,
              name: s.name,
              position: i,
              probability: s.probability,
              isWon: s.isWon ?? false,
              isLost: s.isLost ?? false,
              isActive: true,
            }),
          ),
        );
        return pipeline;
      });
    } catch (err) {
      const winner = await this.pipelines.findOne({
        where: {
          organizationId: orgId,
          businessUnitId: unitId,
          isDefault: true,
        },
      });
      if (winner) return winner;
      throw err;
    }
  }

  async list(
    user: User,
    requestedOrgId?: number,
    unitId?: number,
  ): Promise<PipelineView[]> {
    const orgId = requireOrgScope(user, requestedOrgId);
    const limit = await this.access.brandLimitFor(user);
    if (unitId !== undefined) {
      await this.businessUnits.resolveUnitId(orgId, unitId);
      await this.access.assertBrand(user, unitId, 'Business unit');
      await this.ensureDefault(orgId, unitId);
    }
    const pipelines = await this.pipelines.find({
      where:
        unitId !== undefined
          ? { organizationId: orgId, businessUnitId: unitId }
          : limit
            ? { organizationId: orgId, businessUnitId: In(limit) }
            : { organizationId: orgId },
      order: { isDefault: 'DESC', name: 'ASC' },
    });
    if (pipelines.length === 0) return [];
    const stages = await this.stages.find({
      where: { pipelineId: In(pipelines.map((p) => p.id)) },
      order: { position: 'ASC' },
    });
    return pipelines.map((p) => ({
      ...p,
      stages: stages.filter((s) => s.pipelineId === p.id),
    }));
  }

  async create(user: User, dto: CreatePipelineDto): Promise<PipelineView> {
    const orgId = requireOrgScope(user, dto.organizationId);
    const unitId = await this.businessUnits.resolveUnitId(
      orgId,
      dto.businessUnitId,
    );

    const won = dto.stages.filter((s) => s.isWon).length;
    if (dto.stages.some((s) => s.isWon && s.isLost)) {
      throw new BadRequestException('A stage cannot be both won and lost');
    }
    if (dto.stages.every((s) => s.isWon || s.isLost)) {
      throw new BadRequestException('A pipeline needs at least one open stage');
    }
    if (won > 1) {
      // Several won stages would be ambiguous for reporting. Keep one.
      throw new BadRequestException('A pipeline can have only one won stage');
    }

    return this.pipelines.manager.transaction(async (m) => {
      const pipeline = await m.getRepository(Pipeline).save(
        m.getRepository(Pipeline).create({
          organizationId: orgId,
          businessUnitId: unitId,
          name: dto.name.trim(),
          isDefault: false,
        }),
      );
      const stages = await m.getRepository(PipelineStage).save(
        dto.stages.map((s, i) =>
          m.getRepository(PipelineStage).create({
            organizationId: orgId,
            pipelineId: pipeline.id,
            name: s.name.trim(),
            position: i,
            isWon: s.isWon ?? false,
            isLost: s.isLost ?? false,
            isActive: true,
            probability: s.isWon ? 100 : s.isLost ? 0 : (s.probability ?? 0),
          }),
        ),
      );
      return { ...pipeline, stages };
    });
  }

  async updateStage(
    user: User,
    stageId: number,
    dto: UpdateStageDto,
  ): Promise<PipelineStage> {
    denyClients(user);
    const stage = await this.stages.findOne({ where: { id: stageId } });
    if (!stage) throw new NotFoundException('Stage not found');
    assertRecordInOrg(user, stage.organizationId);

    if (dto.name !== undefined) stage.name = dto.name.trim();
    if (dto.probability !== undefined) {
      // Won and lost stages have fixed probabilities.
      if (!stage.isWon && !stage.isLost) stage.probability = dto.probability;
    }
    if (dto.position !== undefined) stage.position = dto.position;
    if (dto.isActive === false) {
      const all = await this.stages.find({ where: { pipelineId: stage.pipelineId } });
      const reason = cannotTurnOffStage(stage, all.map((s) => ({ ...s, isActive: s.isActive !== false })));
      if (reason) throw new BadRequestException(reason);
      stage.isActive = false;
    } else if (dto.isActive === true) {
      stage.isActive = true;
    }
    return this.stages.save(stage);
  }

  /** Adds a stage. Open stages go before Won and Lost, so the board stays in order. */
  async addStage(user: User, pipelineId: number, dto: AddStageDto): Promise<PipelineStage> {
    denyClients(user);
    const pipeline = await this.pipelines.findOne({ where: { id: pipelineId } });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    assertRecordInOrg(user, pipeline.organizationId);

    const outcome: StageOutcome = dto.outcome ?? 'open';
    const name = dto.name.trim();
    const existing = await this.stages.find({ where: { pipelineId }, order: { position: 'ASC' } });
    if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new BadRequestException(`There is already a stage called ${name}.`);
    }
    if (outcome === 'won' && existing.some((s) => s.isWon)) {
      throw new BadRequestException('A pipeline can have only one Won stage. Rename the one you have.');
    }
    if (outcome === 'lost' && existing.some((s) => s.isLost)) {
      throw new BadRequestException('A pipeline can have only one Lost stage. Rename the one you have.');
    }
    const position = insertPosition(existing, outcome);
    await this.stages
      .createQueryBuilder()
      .update(PipelineStage)
      .set({ position: () => '"position" + 1' })
      .where('"pipelineId" = :pipelineId AND "position" >= :position', { pipelineId, position })
      .execute();
    return this.stages.save(
      this.stages.create({
        organizationId: pipeline.organizationId,
        pipelineId,
        name,
        position,
        probability: outcome === 'won' ? 100 : outcome === 'lost' ? 0 : 50,
        isWon: outcome === 'won',
        isLost: outcome === 'lost',
        isActive: true,
      }),
    );
  }

  /** Sets the stage order to exactly the given ids. */
  async reorder(user: User, pipelineId: number, dto: ReorderStagesDto): Promise<PipelineView> {
    denyClients(user);
    const pipeline = await this.pipelines.findOne({ where: { id: pipelineId } });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    assertRecordInOrg(user, pipeline.organizationId);

    const existing = await this.stages.find({ where: { pipelineId } });
    const known = new Set(existing.map((s) => s.id));
    if (dto.ids.length !== known.size || dto.ids.some((id) => !known.has(id)) || new Set(dto.ids).size !== dto.ids.length) {
      throw new BadRequestException('The order must list each stage of this pipeline once.');
    }
    await Promise.all(dto.ids.map((id, position) => this.stages.update({ id }, { position })));
    const stages = await this.stages.find({ where: { pipelineId }, order: { position: 'ASC' } });
    return { ...pipeline, stages };
  }
}
