import { BillingService } from '../billing/billing.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUnit } from '../entities/business-unit.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { resolveTenantScope } from '../common/utils/tenant-scope.util';
import { allowsManyBrands, normalizeStructure } from '../organizations/unit-structure';
import { OrgUnitsService } from './org-units.service';
import { AccessService } from '../access/access.service';
import {
  CreateBusinessUnitDto,
  UpdateBusinessUnitDto,
} from './dto/business-unit.dto';

/** "MÀRE" -> "mare", "Résort & Spa" -> "resort-spa". Always ASCII, never empty. */
export function slugifyUnitName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'unit'
  );
}

@Injectable()
export class BusinessUnitsService {
  private readonly logger = new Logger(BusinessUnitsService.name);

  constructor(
    private readonly billing: BillingService,
    @InjectRepository(BusinessUnit)
    private readonly repo: Repository<BusinessUnit>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    private readonly orgUnits: OrgUnitsService,
    private readonly access: AccessService,
  ) {}

  /**
   * Returns the organization's default unit, creating it when missing. Safe to call repeatedly.
   * The partial unique index guarantees at most one default per organization, so a concurrent
   * create loses cleanly and re-reads the winner.
   */
  async ensureDefault(orgId: number): Promise<BusinessUnit> {
    const existing = await this.repo.findOne({
      where: { organizationId: orgId, isDefault: true },
    });
    if (existing) {
      // Brands from before units existed are attached to the default unit the first time they are read.
      if (existing.unitId == null) {
        existing.unitId = (await this.orgUnits.ensureDefault(orgId)).id;
        await this.repo.update({ id: existing.id }, { unitId: existing.unitId });
      }
      return existing;
    }

    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    try {
      return await this.repo.save(
        this.repo.create({
          organizationId: orgId,
          name: org.name,
          slug: await this.uniqueSlug(orgId, org.slug),
          unitId: (await this.orgUnits.ensureDefault(orgId)).id,
          isDefault: true,
          isActive: true,
          isPlaceholder: true,
        }),
      );
    } catch (err) {
      const winner = await this.repo.findOne({
        where: { organizationId: orgId, isDefault: true },
      });
      if (winner) return winner;
      this.logger.error(
        `Could not create default business unit for org ${orgId}`,
        err as Error,
      );
      throw err;
    }
  }

  /** How many active business units (brands) an organization has. */
  countActiveForOrg(orgId: number): Promise<number> {
    return this.repo.count({ where: { organizationId: orgId, isActive: true } });
  }

  /**
   * Resolves the unit a new record should belong to. An explicit id must be an active unit of
   * the same organization. Otherwise the organization default is used.
   */
  async resolveUnitId(
    orgId: number,
    requestedUnitId?: number | null,
  ): Promise<number> {
    if (requestedUnitId == null) return (await this.ensureDefault(orgId)).id;
    const unit = await this.repo.findOne({
      where: { id: requestedUnitId, organizationId: orgId },
    });
    if (!unit)
      throw new BadRequestException(
        'Business unit not found in this organization',
      );
    if (!unit.isActive)
      throw new BadRequestException('Business unit is inactive');
    return unit.id;
  }

  /** Looks up one brand in an organization, with the name of its parent unit. */
  async findById(
    orgId: number,
    id: number,
  ): Promise<(BusinessUnit & { unitName: string | null }) | null> {
    const brand = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!brand) return null;
    const unitNames = await this.orgUnits.namesForOrg(orgId);
    return Object.assign(brand, {
      unitName: brand.unitId != null ? (unitNames.get(brand.unitId) ?? null) : null,
    });
  }

  /** The organization's brands, each with the name of the unit it sits in. */
  async list(
    user: User,
    requestedOrgId?: number,
  ): Promise<Array<BusinessUnit & { unitName: string | null }>> {
    const orgId = this.requireOrgId(user, requestedOrgId);
    await this.ensureDefault(orgId);
    const [brands, unitNames] = await Promise.all([
      this.repo.find({
        where: { organizationId: orgId },
        order: { isDefault: 'DESC', name: 'ASC' },
      }),
      this.orgUnits.namesForOrg(orgId),
    ]);
    // Staff limited to some brands only see those brands.
    const limit = await this.access.brandLimitFor(user);
    const visible = limit === null ? brands : brands.filter((b) => limit.includes(b.id));
    return visible.map((b) =>
      Object.assign(b, { unitName: b.unitId != null ? (unitNames.get(b.unitId) ?? null) : null }),
    );
  }

  async create(user: User, dto: CreateBusinessUnitDto): Promise<BusinessUnit> {
    const orgId = this.requireOrgId(user, dto.organizationId);
    // A single-brand layout keeps its one default brand and cannot add more.
    const org = await this.orgRepo.findOne({ where: { id: orgId }, select: ['id', 'unitStructure'] });
    if (org && !allowsManyBrands(normalizeStructure(org.unitStructure))) {
      throw new ForbiddenException(
        'This workspace is set up with a single brand, so it cannot add more. Contact support to change the setup.',
      );
    }
    const placeholder = await this.ensureDefault(orgId);
    const unitId = await this.orgUnits.resolveActiveUnitId(orgId, dto.unitId);

    // The first brand takes over the one the system made in the organization's name,
    // so the company name is not listed as a brand of its own. No new row, so no plan limit check.
    const claimed = await this.claimPlaceholder(placeholder, unitId, dto);
    if (claimed) return claimed;

    await this.billing.assertLimit(orgId, 'units');
    return this.repo.save(
      this.repo.create({
        organizationId: orgId,
        unitId,
        name: dto.name.trim(),
        slug: await this.uniqueSlug(orgId, dto.name),
        logoUrl: dto.logoUrl ?? null,
        brandColor: dto.brandColor ?? null,
        timezone: dto.timezone ?? 'Asia/Kolkata',
        businessProfileEnabled: dto.businessProfileEnabled ?? false,
        legalName: dto.legalName ?? null,
        gstin: dto.gstin ?? null,
        pan: dto.pan ?? null,
        address: dto.address ?? null,
        invoicePrefix: dto.invoicePrefix ?? null,
        isDefault: false,
        isActive: true,
      }),
    );
  }

  async update(
    user: User,
    id: number,
    dto: UpdateBusinessUnitDto,
  ): Promise<BusinessUnit> {
    const unit = await this.findOwned(user, id);
    if (dto.isActive === false && unit.isDefault) {
      throw new ConflictException(
        'The default business unit cannot be deactivated',
      );
    }
    const fields: (keyof UpdateBusinessUnitDto)[] = [
      'name',
      'logoUrl',
      'brandColor',
      'timezone',
      'businessProfileEnabled',
      'legalName',
      'gstin',
      'pan',
      'address',
      'invoicePrefix',
      'isActive',
    ];
    if (dto.unitId !== undefined && dto.unitId !== unit.unitId) {
      unit.unitId = await this.orgUnits.resolveActiveUnitId(unit.organizationId, dto.unitId);
    }
    for (const field of fields) {
      if (dto[field] !== undefined) {
        (unit as unknown as Record<string, unknown>)[field] =
          typeof dto[field] === 'string'
            ? (dto[field] as string).trim()
            : dto[field];
      }
    }
    // Once someone edits the auto-made brand it is theirs, so a later brand no longer takes it over.
    unit.isPlaceholder = false;
    // The slug is fixed after creation, so existing URLs and references stay valid.
    return this.repo.save(unit);
  }

  /** Makes a unit the organization default. Done in one transaction to respect the unique index. */
  async setDefault(user: User, id: number): Promise<BusinessUnit> {
    const unit = await this.findOwned(user, id);
    if (unit.isDefault) return unit;
    if (!unit.isActive)
      throw new ConflictException(
        'Activate the business unit before making it the default',
      );

    await this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(BusinessUnit);
      await repo.update(
        { organizationId: unit.organizationId, isDefault: true },
        { isDefault: false },
      );
      await repo.update({ id: unit.id }, { isDefault: true });
    });
    return this.findOwned(user, id);
  }

  private requireOrgId(user: User, requestedOrgId?: number | null): number {
    if (user.role?.name === RoleName.CLIENT)
      throw new ForbiddenException('Access denied');
    const scope = resolveTenantScope(user, requestedOrgId ?? null);
    if (scope.organizationId == null) {
      throw new BadRequestException(
        'organizationId is required for this request',
      );
    }
    return scope.organizationId;
  }

  /** Loads a unit the caller may manage. Other organizations' units look like "not found". */
  private async findOwned(user: User, id: number): Promise<BusinessUnit> {
    if (user.role?.name === RoleName.CLIENT)
      throw new ForbiddenException('Access denied');
    const unit = await this.repo.findOne({ where: { id } });
    const isMasterAdmin = user.role?.name === RoleName.MASTER_ADMIN;
    if (
      !unit ||
      (!isMasterAdmin && unit.organizationId !== user.organizationId)
    ) {
      throw new NotFoundException('Business unit not found');
    }
    return unit;
  }

  /**
   * Turns the auto-made default brand into the brand being added, when it is still untouched:
   * marked as a placeholder, the only brand in the organization, and with nothing attached to it.
   * Returns the renamed brand, or null when a new row should be created instead.
   */
  private async claimPlaceholder(
    placeholder: BusinessUnit,
    unitId: number | null,
    dto: CreateBusinessUnitDto,
  ): Promise<BusinessUnit | null> {
    if (!placeholder.isPlaceholder || !placeholder.isActive) return null;
    const orgId = placeholder.organizationId;
    if ((await this.repo.count({ where: { organizationId: orgId } })) !== 1) return null;
    if (await this.hasAttachedRecords(placeholder.id)) return null;

    const name = dto.name.trim();
    const slug =
      slugifyUnitName(name) === placeholder.slug ? placeholder.slug : await this.uniqueSlug(orgId, name);
    // Conditional on the flag, so two brands added at the same moment cannot both claim it.
    const result = await this.repo.update(
      { id: placeholder.id, isPlaceholder: true },
      {
        name,
        slug,
        unitId,
        logoUrl: dto.logoUrl ?? null,
        brandColor: dto.brandColor ?? null,
        timezone: dto.timezone ?? 'Asia/Kolkata',
        businessProfileEnabled: dto.businessProfileEnabled ?? false,
        legalName: dto.legalName ?? null,
        gstin: dto.gstin ?? null,
        pan: dto.pan ?? null,
        address: dto.address ?? null,
        invoicePrefix: dto.invoicePrefix ?? null,
        isPlaceholder: false,
      },
    );
    if (!result.affected) return null;
    this.logger.log(`Organization ${orgId}: first brand "${name}" took over the placeholder brand ${placeholder.id}`);
    return this.repo.findOne({ where: { id: placeholder.id } });
  }

  /** Whether any table that points at brands (leads, forms, mail accounts, staff, ...) uses this one. */
  private async hasAttachedRecords(businessUnitId: number): Promise<boolean> {
    const { connection } = this.repo.manager;
    for (const meta of connection.entityMetadatas) {
      if (meta.target === BusinessUnit) continue;
      const column = meta.columns.find((c) => c.propertyName === 'businessUnitId');
      if (!column) continue;
      const rows: unknown[] = await connection.query(
        `SELECT 1 FROM "${meta.tableName}" WHERE "${column.databaseName}" = $1 LIMIT 1`,
        [businessUnitId],
      );
      if (rows.length > 0) return true;
    }
    return false;
  }

  private async uniqueSlug(orgId: number, source: string): Promise<string> {
    const base = slugifyUnitName(source);
    let slug = base;
    let counter = 1;
    while (
      await this.repo.findOne({ where: { organizationId: orgId, slug } })
    ) {
      counter += 1;
      slug = `${base}-${counter}`;
    }
    return slug;
  }
}
