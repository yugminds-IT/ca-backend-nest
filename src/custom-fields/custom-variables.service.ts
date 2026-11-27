import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CustomVariable, CustomVariableValue } from '../entities/custom-fields.entities';
import { Client } from '../entities/client.entity';
import { User } from '../entities/user.entity';
import { BusinessUnitsService } from '../business-units/business-units.service';
import { assertRecordInOrg, denyClients, requireOrgScope } from '../leads/lead-scope.util';
import { CreateCustomVariableDto, UpdateCustomVariableDto } from './dto/custom-field.dto';
import { KEY_PATTERN, keyFromLabel } from './custom-field.rules';

const MAX_VALUE_LENGTH = 5000;

export interface CustomVariableView {
  id: number;
  key: string;
  label: string;
  defaultValue: string;
  businessUnitId: number | null;
  /** clientId (as a string) -> that client's value */
  values: Record<string, string>;
}

@Injectable()
export class CustomVariablesService {
  constructor(
    @InjectRepository(CustomVariable)
    private readonly vars: Repository<CustomVariable>,
    @InjectRepository(CustomVariableValue)
    private readonly values: Repository<CustomVariableValue>,
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    private readonly businessUnits: BusinessUnitsService,
  ) {}

  /** Variables usable in a unit: the unit's own plus organization-wide ones. Omit unitId for all. */
  async list(user: User, requestedOrgId?: number, unitId?: number): Promise<CustomVariableView[]> {
    const orgId = requireOrgScope(user, requestedOrgId);
    const qb = this.vars
      .createQueryBuilder('v')
      .where('v.organizationId = :orgId', { orgId })
      .orderBy('v.key', 'ASC');
    if (unitId !== undefined) {
      await this.businessUnits.resolveUnitId(orgId, unitId);
      qb.andWhere('(v.businessUnitId = :unitId OR v.businessUnitId IS NULL)', { unitId });
    }
    const vars = await qb.getMany();
    if (vars.length === 0) return [];

    const rows = await this.values.find({ where: { variableId: In(vars.map((v) => v.id)) } });
    return vars.map((v) => ({
      id: v.id,
      key: v.key,
      label: v.label,
      defaultValue: v.defaultValue,
      businessUnitId: v.businessUnitId,
      values: Object.fromEntries(
        rows.filter((r) => r.variableId === v.id).map((r) => [String(r.clientId), r.value]),
      ),
    }));
  }

  async create(user: User, dto: CreateCustomVariableDto): Promise<CustomVariable> {
    const orgId = requireOrgScope(user, dto.organizationId);
    const unitId =
      dto.businessUnitId == null ? null : await this.businessUnits.resolveUnitId(orgId, dto.businessUnitId);

    const key = dto.key?.trim() || keyFromLabel(dto.label);
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException('Keys use lower-case letters, digits and underscores, and start with a letter');
    }
    const existing = await this.vars.findOne({ where: { organizationId: orgId, key } });
    if (existing) throw new ConflictException(`A variable named "${key}" already exists`);

    return this.vars.save(
      this.vars.create({
        organizationId: orgId,
        businessUnitId: unitId,
        key,
        label: dto.label.trim(),
        defaultValue: dto.defaultValue ?? '',
      }),
    );
  }

  async update(user: User, id: number, dto: UpdateCustomVariableDto): Promise<CustomVariable> {
    const variable = await this.owned(user, id);
    if (dto.label !== undefined) variable.label = dto.label.trim();
    if (dto.defaultValue !== undefined) variable.defaultValue = dto.defaultValue;
    return this.vars.save(variable);
  }

  async remove(user: User, id: number): Promise<void> {
    const variable = await this.owned(user, id);
    await this.vars.remove(variable);
  }

  /**
   * Sets one client's values for several variables at once. An empty string clears the value,
   * so the variable's default applies again. Unknown keys are rejected, not ignored.
   */
  async setClientValues(
    user: User,
    clientId: number,
    input: Record<string, string>,
  ): Promise<{ saved: number; cleared: number }> {
    const orgId = requireOrgScope(user);
    const client = await this.clients.findOne({ where: { id: clientId, organizationId: orgId } });
    if (!client) throw new NotFoundException('Client not found');

    const entries = Object.entries(input ?? {});
    if (entries.length === 0) return { saved: 0, cleared: 0 };

    for (const [, v] of entries) {
      if (typeof v !== 'string') throw new BadRequestException('Every value must be text');
      if (v.length > MAX_VALUE_LENGTH) throw new BadRequestException(`Values are limited to ${MAX_VALUE_LENGTH} characters`);
    }

    const keys = entries.map(([k]) => k);
    const variables = await this.vars.find({ where: { organizationId: orgId, key: In(keys) } });
    const unknown = keys.filter((k) => !variables.some((v) => v.key === k));
    if (unknown.length > 0) throw new BadRequestException(`Unknown variable: ${unknown.join(', ')}`);

    let saved = 0;
    let cleared = 0;
    await this.values.manager.transaction(async (m) => {
      const repo = m.getRepository(CustomVariableValue);
      for (const variable of variables) {
        const value = (input[variable.key] ?? '').trim();
        const existing = await repo.findOne({ where: { variableId: variable.id, clientId } });
        if (value === '') {
          if (existing) {
            await repo.delete({ id: existing.id });
            cleared++;
          }
          continue;
        }
        if (existing) {
          if (existing.value !== value) await repo.update({ id: existing.id }, { value });
        } else {
          await repo.save(
            repo.create({ organizationId: orgId, variableId: variable.id, clientId, value }),
          );
        }
        saved++;
      }
    });
    return { saved, cleared };
  }

  private async owned(user: User, id: number): Promise<CustomVariable> {
    denyClients(user);
    const variable = await this.vars.findOne({ where: { id } });
    if (!variable) throw new NotFoundException('Variable not found');
    assertRecordInOrg(user, variable.organizationId);
    return variable;
  }
}
