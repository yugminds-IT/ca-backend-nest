import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUnit } from '../entities/business-unit.entity';
import { OrgUnit } from '../entities/org-unit.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { resolveTenantScope } from '../common/utils/tenant-scope.util';
import { allowsManyUnits, normalizeStructure } from '../organizations/unit-structure';
import { CreateOrgUnitDto, UpdateOrgUnitDto } from './dto/org-unit.dto';

export const DEFAULT_UNIT_NAME = 'Main unit';

/** Units (places). Brands sit inside them: see BusinessUnitsService. */
@Injectable()
export class OrgUnitsService {
  constructor(
    @InjectRepository(OrgUnit) private readonly repo: Repository<OrgUnit>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    @InjectRepository(BusinessUnit) private readonly brands: Repository<BusinessUnit>,
  ) {}

  /** The organization's default unit, created when missing. Safe to call repeatedly. */
  async ensureDefault(orgId: number): Promise<OrgUnit> {
    const existing = await this.repo.findOne({ where: { organizationId: orgId, isDefault: true } });
    if (existing) return existing;
    const org = await this.orgRepo.findOne({ where: { id: orgId }, select: ['id'] });
    if (!org) throw new NotFoundException('Organization not found');
    try {
      return await this.repo.save(
        this.repo.create({ organizationId: orgId, name: DEFAULT_UNIT_NAME, isDefault: true, isActive: true }),
      );
    } catch (err) {
      // A concurrent request created it first; the partial unique index guarantees one default.
      const winner = await this.repo.findOne({ where: { organizationId: orgId, isDefault: true } });
      if (winner) return winner;
      throw err;
    }
  }

  async list(user: User, requestedOrgId?: number): Promise<OrgUnit[]> {
    const orgId = this.requireOrgId(user, requestedOrgId);
    await this.ensureDefault(orgId);
    return this.repo.find({ where: { organizationId: orgId }, order: { isDefault: 'DESC', name: 'ASC' } });
  }

  async create(user: User, dto: CreateOrgUnitDto): Promise<OrgUnit> {
    const orgId = this.requireOrgId(user, dto.organizationId);
    const org = await this.orgRepo.findOne({ where: { id: orgId }, select: ['id', 'unitStructure'] });
    if (org && !allowsManyUnits(normalizeStructure(org.unitStructure))) {
      throw new ForbiddenException(
        'This workspace is set up with a single unit, so it cannot add another. Contact support to change the setup.',
      );
    }
    await this.ensureDefault(orgId);
    return this.repo.save(
      this.repo.create({
        organizationId: orgId,
        name: dto.name.trim(),
        city: dto.city?.trim() || null,
        isDefault: false,
        isActive: true,
      }),
    );
  }

  async update(user: User, id: number, dto: UpdateOrgUnitDto): Promise<OrgUnit> {
    const unit = await this.findOwned(user, id);
    if (dto.isActive === false && unit.isDefault) {
      throw new ConflictException('The default unit cannot be deactivated');
    }
    if (dto.isActive === false && unit.isActive) {
      const active = await this.brands.count({ where: { unitId: unit.id, isActive: true } });
      if (active > 0) {
        throw new ConflictException('Deactivate or move this unit\'s brands before deactivating the unit');
      }
    }
    if (dto.name !== undefined) unit.name = dto.name.trim();
    if (dto.city !== undefined) unit.city = dto.city.trim() || null;
    if (dto.isActive !== undefined) unit.isActive = dto.isActive;
    return this.repo.save(unit);
  }

  /** A unit id a new or moved brand may use: active and in the organization. Defaults to the default unit. */
  async resolveActiveUnitId(orgId: number, requestedUnitId?: number | null): Promise<number> {
    if (requestedUnitId == null) return (await this.ensureDefault(orgId)).id;
    const unit = await this.repo.findOne({ where: { id: requestedUnitId, organizationId: orgId } });
    if (!unit) throw new BadRequestException('Unit not found in this organization');
    if (!unit.isActive) throw new BadRequestException('Unit is inactive');
    return unit.id;
  }

  /** Ids of the units in an organization that belong to it. Drops anything else. */
  async idsInOrg(orgId: number, ids: number[]): Promise<number[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.repo.find({ where: unique.map((id) => ({ id, organizationId: orgId })), select: ['id'] });
    if (found.length !== unique.length) throw new BadRequestException('One or more units are not in this organization');
    return found.map((u) => u.id);
  }

  /** Unit names by id, so a brand list can say which unit each brand sits in. */
  async namesForOrg(orgId: number): Promise<Map<number, string>> {
    const rows = await this.repo.find({ where: { organizationId: orgId }, select: ['id', 'name'] });
    return new Map(rows.map((u) => [u.id, u.name]));
  }

  countActive(orgId: number): Promise<number> {
    return this.repo.count({ where: { organizationId: orgId, isActive: true } });
  }

  private requireOrgId(user: User, requestedOrgId?: number | null): number {
    if (user.role?.name === RoleName.CLIENT) throw new ForbiddenException('Access denied');
    const scope = resolveTenantScope(user, requestedOrgId ?? null);
    if (scope.organizationId == null) {
      throw new BadRequestException('organizationId is required for this request');
    }
    return scope.organizationId;
  }

  private async findOwned(user: User, id: number): Promise<OrgUnit> {
    if (user.role?.name === RoleName.CLIENT) throw new ForbiddenException('Access denied');
    const unit = await this.repo.findOne({ where: { id } });
    const isMasterAdmin = user.role?.name === RoleName.MASTER_ADMIN;
    if (!unit || (!isMasterAdmin && unit.organizationId !== user.organizationId)) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }
}
