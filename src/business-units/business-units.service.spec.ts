import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BusinessUnitsService,
  slugifyUnitName,
} from './business-units.service';
import { GSTIN_PATTERN, PAN_PATTERN } from './dto/business-unit.dto';

/** Access for a user who may see every brand. */
const openAccess = { brandLimitFor: jest.fn(async () => null), assertBrand: jest.fn(async () => undefined) } as never;

describe('slugifyUnitName', () => {
  it('strips accents so MÀRE becomes mare', () => {
    expect(slugifyUnitName('MÀRE')).toBe('mare');
  });

  it('collapses punctuation and spaces into single hyphens', () => {
    expect(slugifyUnitName('Résort & Spa')).toBe('resort-spa');
    expect(slugifyUnitName('  Tavaro   Wellness!! ')).toBe('tavaro-wellness');
  });

  it('never returns an empty slug', () => {
    expect(slugifyUnitName('!!!')).toBe('unit');
    expect(slugifyUnitName('')).toBe('unit');
  });

  it('caps long names at 90 characters', () => {
    expect(slugifyUnitName('a'.repeat(200)).length).toBe(90);
  });
});

describe('GSTIN and PAN patterns', () => {
  it('accepts a well-formed GSTIN', () => {
    expect(GSTIN_PATTERN.test('27AAPFU0939F1ZV')).toBe(true);
  });

  it('rejects a GSTIN with letters where the state code should be', () => {
    expect(GSTIN_PATTERN.test('ABCDE1234F1Z5')).toBe(false);
  });

  it('rejects a GSTIN that is too short', () => {
    expect(GSTIN_PATTERN.test('27AAPFU0939F1Z')).toBe(false);
  });

  it('accepts a well-formed PAN and rejects lowercase or wrong shape', () => {
    expect(PAN_PATTERN.test('ABCPE1234F')).toBe(true);
    expect(PAN_PATTERN.test('abcpe1234f')).toBe(false);
    expect(PAN_PATTERN.test('ABCPE12345')).toBe(false);
  });
});

describe('BusinessUnitsService.resolveUnitId', () => {
  function makeService(
    units: Record<
      number,
      {
        id: number;
        organizationId: number;
        isActive: boolean;
        isDefault: boolean;
      }
    >,
  ) {
    const repo = {
      findOne: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          if (where.isDefault === true) {
            return (
              Object.values(units).find(
                (u) => u.organizationId === where.organizationId && u.isDefault,
              ) ?? null
            );
          }
          return units[where.id as number] &&
            units[where.id as number].organizationId === where.organizationId
            ? units[where.id as number]
            : null;
        },
      ),
      create: jest.fn((x: unknown) => x),
      save: jest.fn(async (x: unknown) => x),
      update: jest.fn(async () => undefined),
    };
    const orgRepo = { findOne: jest.fn() };
    const orgUnits = { ensureDefault: jest.fn(async () => ({ id: 1 })) };
    return new BusinessUnitsService(
      { assertLimit: jest.fn(async () => undefined) } as never,
      repo as never,
      orgRepo as never,
      orgUnits as never,
      openAccess,
    );
  }

  const units = {
    1: { id: 1, organizationId: 10, isActive: true, isDefault: true },
    2: { id: 2, organizationId: 10, isActive: true, isDefault: false },
    3: { id: 3, organizationId: 10, isActive: false, isDefault: false },
    4: { id: 4, organizationId: 20, isActive: true, isDefault: true },
  };

  it('falls back to the organization default when no unit is requested', async () => {
    const service = makeService(units);
    await expect(service.resolveUnitId(10, undefined)).resolves.toBe(1);
    await expect(service.resolveUnitId(10, null)).resolves.toBe(1);
  });

  it('accepts an active unit of the same organization', async () => {
    const service = makeService(units);
    await expect(service.resolveUnitId(10, 2)).resolves.toBe(2);
  });

  it('rejects a unit that belongs to another organization', async () => {
    const service = makeService(units);
    await expect(service.resolveUnitId(10, 4)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an inactive unit', async () => {
    const service = makeService(units);
    await expect(service.resolveUnitId(10, 3)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('BusinessUnitsService.create and the unit structure', () => {
  const admin = { organizationId: 10, role: { name: 'ORG_ADMIN' } } as never;

  function makeService(unitStructure: string | null) {
    const saved = jest.fn(async (u: unknown) => u);
    const repo = {
      findOne: jest.fn(async (q: { where: { isDefault?: boolean } }) =>
        q.where.isDefault ? { id: 1, organizationId: 10, unitId: 5, isDefault: true } : null,
      ),
      create: jest.fn((u: unknown) => u),
      save: saved,
    };
    const orgRepo = { findOne: jest.fn(async () => (unitStructure ? { id: 10, unitStructure } : null)) };
    const billing = { assertLimit: jest.fn(async () => undefined) };
    const orgUnits = {
      ensureDefault: jest.fn(async () => ({ id: 5 })),
      resolveActiveUnitId: jest.fn(async (_org: number, requested?: number | null) => requested ?? 5),
    };
    return {
      service: new BusinessUnitsService(billing as never, repo as never, orgRepo as never, orgUnits as never, openAccess),
      saved,
      billing,
      orgUnits,
    };
  }

  it.each(['one_unit_one_brand', 'one_unit_no_brand'])('refuses to add a brand in %s and does not charge the plan limit', async (structure) => {
    const { service, saved, billing } = makeService(structure);
    await expect(service.create(admin, { name: 'Brand B' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(saved).not.toHaveBeenCalled();
    expect(billing.assertLimit).not.toHaveBeenCalled();
  });

  it.each(['multi_unit', 'one_unit_multi_brand'])('lets a %s organization add a brand', async (structure) => {
    const { service, saved } = makeService(structure);
    await expect(service.create(admin, { name: 'Brand B' } as never)).resolves.toBeDefined();
    expect(saved).toHaveBeenCalled();
  });

  it('puts the brand in the requested unit, or the default unit when none is given', async () => {
    const { service, orgUnits } = makeService('multi_unit');
    const inDefault = (await service.create(admin, { name: 'Rice mills' } as never)) as unknown as { unitId: number };
    expect(inDefault.unitId).toBe(5);
    const inOther = (await service.create(admin, { name: 'Flour mills', unitId: 9 } as never)) as unknown as { unitId: number };
    expect(inOther.unitId).toBe(9);
    expect(orgUnits.resolveActiveUnitId).toHaveBeenCalledWith(10, 9);
  });

  it('treats a missing structure like the most open layout', async () => {
    const { service } = makeService('something_old');
    await expect(service.create(admin, { name: 'Brand B' } as never)).resolves.toBeDefined();
  });
});

describe('BusinessUnitsService.list', () => {
  const admin = { organizationId: 10, role: { name: 'ORG_ADMIN' } } as never;

  it('says which unit each brand sits in', async () => {
    const rows = [
      { id: 1, organizationId: 10, name: 'Rice mills', unitId: 5, isDefault: true },
      { id: 2, organizationId: 10, name: 'Rice mills', unitId: 6, isDefault: false },
      { id: 3, organizationId: 10, name: 'Old brand', unitId: null, isDefault: false },
    ];
    const repo = {
      findOne: jest.fn(async () => rows[0]),
      find: jest.fn(async () => rows),
    };
    const orgUnits = {
      ensureDefault: jest.fn(async () => ({ id: 5 })),
      namesForOrg: jest.fn(async () => new Map([[5, 'Shamshabad'], [6, 'Hyderabad']])),
    };
    const service = new BusinessUnitsService({} as never, repo as never, {} as never, orgUnits as never, openAccess);
    const list = await service.list(admin);
    expect(list.map((b) => [b.name, b.unitName])).toEqual([
      ['Rice mills', 'Shamshabad'],
      ['Rice mills', 'Hyderabad'],
      ['Old brand', null],
    ]);
  });
});

describe('BusinessUnitsService.create taking over the placeholder brand', () => {
  const admin = { organizationId: 10, role: { name: 'ORG_ADMIN' } } as never;

  function makeService(opts: {
    placeholder?: boolean;
    brandCount?: number;
    attachedIn?: string[];
    claimAffected?: number;
  }) {
    const placeholderRow = {
      id: 1,
      organizationId: 10,
      name: 'Navedhana',
      slug: 'navedhana',
      unitId: 5,
      isDefault: true,
      isActive: true,
      isPlaceholder: opts.placeholder ?? true,
    };
    const tables = ['leads', 'forms', 'mail_accounts'];
    const query = jest.fn(async (_sql: string, _params: unknown[]) => {
      const table = /FROM "([^"]+)"/.exec(_sql)?.[1] ?? '';
      return (opts.attachedIn ?? []).includes(table) ? [{ '?column?': 1 }] : [];
    });
    const repo = {
      findOne: jest.fn(async (q: { where: { isDefault?: boolean; id?: number; slug?: string } }) => {
        if (q.where.isDefault) return placeholderRow;
        if (q.where.id === 1) return { ...placeholderRow, name: 'Software', slug: 'software', isPlaceholder: false };
        return null;
      }),
      count: jest.fn(async () => opts.brandCount ?? 1),
      update: jest.fn(async () => ({ affected: opts.claimAffected ?? 1 })),
      create: jest.fn((u: unknown) => u),
      save: jest.fn(async (u: unknown) => u),
      manager: {
        connection: {
          query,
          entityMetadatas: tables.map((tableName) => ({
            target: tableName,
            tableName,
            columns: [{ propertyName: 'businessUnitId', databaseName: 'businessUnitId' }],
          })),
        },
      },
    };
    const orgRepo = { findOne: jest.fn(async () => ({ id: 10, unitStructure: 'one_unit_multi_brand' })) };
    const billing = { assertLimit: jest.fn(async () => undefined) };
    const orgUnits = {
      ensureDefault: jest.fn(async () => ({ id: 5 })),
      resolveActiveUnitId: jest.fn(async () => 5),
    };
    return {
      service: new BusinessUnitsService(billing as never, repo as never, orgRepo as never, orgUnits as never, openAccess),
      repo,
      billing,
    };
  }

  it('renames the untouched company-named brand instead of adding a second one', async () => {
    const { service, repo, billing } = makeService({});
    const brand = await service.create(admin, { name: 'Software' } as never);
    expect(brand.name).toBe('Software');
    expect(repo.update).toHaveBeenCalledWith(
      { id: 1, isPlaceholder: true },
      expect.objectContaining({ name: 'Software', slug: 'software', isPlaceholder: false }),
    );
    expect(repo.save).not.toHaveBeenCalled();
    expect(billing.assertLimit).not.toHaveBeenCalled();
  });

  it('adds a new brand when the default one was already edited', async () => {
    const { service, repo } = makeService({ placeholder: false });
    await service.create(admin, { name: 'Solar' } as never);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });

  it('adds a new brand when other brands already exist', async () => {
    const { service, repo } = makeService({ brandCount: 2 });
    await service.create(admin, { name: 'Solar' } as never);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });

  it('keeps the default brand when leads, forms or mail accounts already use it', async () => {
    const { service, repo } = makeService({ attachedIn: ['forms'] });
    await service.create(admin, { name: 'Software' } as never);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });

  it('falls back to a new brand when another request claimed the placeholder first', async () => {
    const { service, repo } = makeService({ claimAffected: 0 });
    await service.create(admin, { name: 'Software' } as never);
    expect(repo.save).toHaveBeenCalled();
  });
});

describe('BusinessUnitsService.update', () => {
  it('stops treating the default brand as a placeholder once someone edits it', async () => {
    const admin = { organizationId: 10, role: { name: 'ORG_ADMIN' } } as never;
    const row = { id: 1, organizationId: 10, name: 'Navedhana', isDefault: true, isActive: true, isPlaceholder: true };
    const repo = { findOne: jest.fn(async () => row), save: jest.fn(async (u: unknown) => u) };
    const service = new BusinessUnitsService({} as never, repo as never, {} as never, {} as never, openAccess);
    const saved = await service.update(admin, 1, { brandColor: '#123456' } as never);
    expect(saved.isPlaceholder).toBe(false);
  });
});

describe('BusinessUnitsService.list for staff limited to some brands', () => {
  it('only returns the brands the staff member is assigned to', async () => {
    const staff = { organizationId: 10, role: { name: 'ORG_EMPLOYEE' } } as never;
    const rows = [
      { id: 11, organizationId: 10, name: 'software', unitId: 5, isDefault: true },
      { id: 12, organizationId: 10, name: 'solar', unitId: 5, isDefault: false },
    ];
    const repo = { findOne: jest.fn(async () => rows[0]), find: jest.fn(async () => rows) };
    const orgUnits = { ensureDefault: jest.fn(async () => ({ id: 5 })), namesForOrg: jest.fn(async () => new Map()) };
    const access = { brandLimitFor: jest.fn(async () => [11]) };
    const service = new BusinessUnitsService({} as never, repo as never, {} as never, orgUnits as never, access as never);
    const list = await service.list(staff);
    expect(list.map((b) => b.name)).toEqual(['software']);
  });
});
