import { BillingService } from '../billing/billing.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomFieldDefinition, CustomFieldType } from '../entities/custom-fields.entities';
import { User } from '../entities/user.entity';
import { AccessService } from '../access/access.service';
import { BusinessUnitsService } from '../business-units/business-units.service';
import { assertRecordInOrg, denyClients, requireOrgScope } from '../leads/lead-scope.util';
import { CreateCustomFieldDto, ReorderCustomFieldsDto, UpdateCustomFieldDto } from './dto/custom-field.dto';
import { OPTION_TYPES, canEdit, canSee, convertibleTypes, keyFromLabel, keyProblem } from './custom-field.rules';

/** A definition plus what the requesting role may do with it, so clients need no role rules of their own. */
export type CustomFieldView = CustomFieldDefinition & { canSee: boolean; canEdit: boolean };

@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly billing: BillingService,
    @InjectRepository(CustomFieldDefinition)
    private readonly defs: Repository<CustomFieldDefinition>,
    private readonly businessUnits: BusinessUnitsService,
    private readonly access: AccessService,
  ) {}

  /** Fields for a unit, in layout order. Includes inactive fields so admins can re-enable them. */
  async list(user: User, requestedOrgId?: number, unitId?: number): Promise<CustomFieldView[]> {
    const orgId = requireOrgScope(user, requestedOrgId);
    const unit = await this.businessUnits.resolveUnitId(orgId, unitId ?? null);
    await this.access.assertBrand(user, unit, 'Business unit');
    const defs = await this.defs.find({
      where: { organizationId: orgId, businessUnitId: unit, entityType: 'lead' },
      order: { position: 'ASC', label: 'ASC' },
    });
    const role = user.role?.name;
    return defs.map((d) => ({ ...d, canSee: canSee(d, role), canEdit: canEdit(d, role) }));
  }

  /** Active fields for a unit. Used by lead validation. */
  activeForUnit(orgId: number, unitId: number): Promise<CustomFieldDefinition[]> {
    return this.defs.find({
      where: { organizationId: orgId, businessUnitId: unitId, entityType: 'lead', isActive: true },
      order: { position: 'ASC' },
    });
  }

  async create(user: User, dto: CreateCustomFieldDto): Promise<CustomFieldDefinition> {
    const orgId = requireOrgScope(user, dto.organizationId);
    await this.billing.assertLimit(orgId, 'customFields');
    const unitId = await this.businessUnits.resolveUnitId(orgId, dto.businessUnitId ?? null);
    await this.access.assertBrand(user, unitId, 'Business unit');

    const key = dto.key?.trim() || keyFromLabel(dto.label);
    const problem = keyProblem(key);
    if (problem) throw new BadRequestException(problem);

    const existing = await this.defs.findOne({
      where: { organizationId: orgId, businessUnitId: unitId, entityType: 'lead', key },
    });
    if (existing) throw new ConflictException(`A field with the key "${key}" already exists in this unit`);

    const options = this.cleanOptions(dto.fieldType, dto.options);
    await this.checkShowIf(orgId, unitId, key, dto.showIfKey, dto.showIfValue);

    const last = await this.defs
      .createQueryBuilder('d')
      .select('MAX(d.position)', 'max')
      .where('d.organizationId = :orgId AND d.businessUnitId = :unitId AND d.entityType = :entity', {
        orgId,
        unitId,
        entity: 'lead',
      })
      .getRawOne<{ max: number | null }>();

    return this.defs.save(
      this.defs.create({
        organizationId: orgId,
        businessUnitId: unitId,
        entityType: 'lead',
        key,
        label: dto.label.trim(),
        fieldType: dto.fieldType,
        options,
        required: dto.required ?? false,
        position: (last?.max ?? -1) + 1,
        section: dto.section?.trim() || 'Details',
        helpText: dto.helpText?.trim() || null,
        showIfKey: dto.showIfKey ?? null,
        showIfValue: dto.showIfKey ? (dto.showIfValue ?? '') : null,
        visibleToRoles: dto.visibleToRoles ?? [],
        editableByRoles: dto.editableByRoles ?? [],
        isActive: true,
      }),
    );
  }

  async update(user: User, id: number, dto: UpdateCustomFieldDto): Promise<CustomFieldDefinition> {
    denyClients(user);
    const def = await this.defs.findOne({ where: { id, entityType: 'lead' } });
    if (!def) throw new NotFoundException('Field not found');
    assertRecordInOrg(user, def.organizationId);
    await this.access.assertBrand(user, def.businessUnitId, 'Field');

    if (dto.label !== undefined) def.label = dto.label.trim();
    if (dto.fieldType !== undefined && dto.fieldType !== def.fieldType) {
      if (!convertibleTypes(def.fieldType).includes(dto.fieldType)) {
        throw new BadRequestException(
          `A ${def.fieldType} field cannot become ${dto.fieldType}, because existing lead values might not fit. Add a new field instead`,
        );
      }
      def.fieldType = dto.fieldType;
      // Moving to or from a choice type: keep the choices the field has, or drop them for a plain type.
      def.options = this.cleanOptions(def.fieldType, dto.options ?? def.options);
    } else if (dto.options !== undefined) {
      def.options = this.cleanOptions(def.fieldType, dto.options);
    }
    if (dto.required !== undefined) def.required = dto.required;
    if (dto.section !== undefined) def.section = dto.section.trim() || 'Details';
    if (dto.helpText !== undefined) def.helpText = dto.helpText?.trim() || null;
    if (dto.showIfKey !== undefined || dto.showIfValue !== undefined) {
      const nextKey = dto.showIfKey === undefined ? def.showIfKey : dto.showIfKey;
      const nextValue = dto.showIfValue === undefined ? def.showIfValue : dto.showIfValue;
      await this.checkShowIf(def.organizationId, def.businessUnitId, def.key, nextKey ?? undefined, nextValue ?? undefined);
      def.showIfKey = nextKey ?? null;
      def.showIfValue = nextKey ? (nextValue ?? '') : null;
    }
    if (dto.visibleToRoles !== undefined) def.visibleToRoles = dto.visibleToRoles;
    if (dto.editableByRoles !== undefined) def.editableByRoles = dto.editableByRoles;
    if (dto.isActive !== undefined) def.isActive = dto.isActive;
    if (dto.position !== undefined) def.position = dto.position;
    return this.defs.save(def);
  }

  /**
   * Deletes a field and clears its value from every lead in the unit, so the key can be reused cleanly.
   * Refused while another field's show-if rule points at it. Turning the field off keeps the data instead.
   */
  async remove(user: User, id: number): Promise<void> {
    denyClients(user);
    const def = await this.defs.findOne({ where: { id, entityType: 'lead' } });
    if (!def) throw new NotFoundException('Field not found');
    assertRecordInOrg(user, def.organizationId);
    await this.access.assertBrand(user, def.businessUnitId, 'Field');

    const dependents = await this.defs.find({
      where: {
        organizationId: def.organizationId,
        businessUnitId: def.businessUnitId,
        entityType: 'lead',
        showIfKey: def.key,
      },
    });
    if (dependents.length > 0) {
      const names = dependents.map((d) => `"${d.label}"`).join(', ');
      throw new ConflictException(
        `${names} only ${dependents.length === 1 ? 'shows' : 'show'} when "${def.label}" has a value. Remove that rule first`,
      );
    }

    await this.defs.manager.transaction(async (m) => {
      await m.query(
        `UPDATE "leads" SET "customData" = "customData" - $1 WHERE "organizationId" = $2 AND "businessUnitId" = $3`,
        [def.key, def.organizationId, def.businessUnitId],
      );
      await m.getRepository(CustomFieldDefinition).delete({ id: def.id });
    });
  }

  /** Sets layout order. `ids` must be exactly the unit's active fields. */
  async reorder(user: User, dto: ReorderCustomFieldsDto): Promise<CustomFieldDefinition[]> {
    const orgId = requireOrgScope(user, dto.organizationId);
    const unitId = await this.businessUnits.resolveUnitId(orgId, dto.businessUnitId);
    await this.access.assertBrand(user, unitId, 'Business unit');
    const active = await this.activeForUnit(orgId, unitId);
    const wanted = new Set(dto.ids);
    if (wanted.size !== dto.ids.length || wanted.size !== active.length || active.some((d) => !wanted.has(d.id))) {
      throw new BadRequestException('ids must list every active field of this unit exactly once');
    }

    await this.defs.manager.transaction(async (m) => {
      const repo = m.getRepository(CustomFieldDefinition);
      for (let i = 0; i < dto.ids.length; i++) {
        await repo.update({ id: dto.ids[i] }, { position: i });
      }
    });
    return this.activeForUnit(orgId, unitId);
  }

  private cleanOptions(fieldType: CustomFieldType, options?: string[]): string[] {
    if (!OPTION_TYPES.has(fieldType)) return [];
    const cleaned = [...new Set((options ?? []).map((o) => o.trim()).filter(Boolean))];
    if (cleaned.length === 0) throw new BadRequestException('Add at least one option for a choice field');
    return cleaned;
  }

  /** The controlling field must exist, be active, be another field, and come with a value. */
  private async checkShowIf(
    orgId: number,
    unitId: number,
    ownKey: string,
    showIfKey?: string,
    showIfValue?: string,
  ): Promise<void> {
    if (!showIfKey) return;
    if (showIfKey === ownKey) throw new BadRequestException('A field cannot depend on itself');
    if (showIfValue === undefined || showIfValue === null || showIfValue === '') {
      throw new BadRequestException('Choose the value that shows this field');
    }
    const controller = await this.defs.findOne({
      where: { organizationId: orgId, businessUnitId: unitId, entityType: 'lead', key: showIfKey, isActive: true },
    });
    if (!controller) throw new BadRequestException(`Show-if refers to unknown field "${showIfKey}"`);
  }
}
