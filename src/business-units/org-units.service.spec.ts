import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OrgUnitsService } from './org-units.service';

const admin = { organizationId: 10, role: { name: 'ORG_ADMIN' } } as never;

interface Unit {
  id: number;
  organizationId: number;
  name: string;
  city: string | null;
  isDefault: boolean;
  isActive: boolean;
}

function makeService(opts: { structure?: string; units?: Unit[]; activeBrands?: number } = {}) {
  const units: Unit[] = opts.units ?? [
    { id: 1, organizationId: 10, name: 'Main unit', city: null, isDefault: true, isActive: true },
  ];
  let nextId = 100;
  const repo = {
    findOne: jest.fn(async ({ where }: { where: Partial<Unit> }) =>
      units.find((u) => Object.entries(where).every(([k, v]) => (u as never)[k] === v)) ?? null,
    ),
    find: jest.fn(async () => units),
    create: jest.fn((u: Partial<Unit>) => u),
    save: jest.fn(async (u: Partial<Unit>) => ({ id: nextId++, ...u }) as Unit),
    count: jest.fn(async () => units.filter((u) => u.isActive).length),
  };
  const orgRepo = {
    findOne: jest.fn(async () => ({ id: 10, unitStructure: opts.structure ?? 'multi_unit' })),
  };
  const brands = { count: jest.fn(async () => opts.activeBrands ?? 0) };
  const service = new OrgUnitsService(repo as never, orgRepo as never, brands as never);
  return { service, repo, units };
}

describe('OrgUnitsService.create', () => {
  it('adds a unit in a multi-unit organization', async () => {
    const { service, repo } = makeService();
    const created = await service.create(admin, { name: '  Hyderabad ', city: 'Hyderabad' });
    expect(created.name).toBe('Hyderabad');
    expect(created.isDefault).toBe(false);
    expect(repo.save).toHaveBeenCalled();
  });

  it.each(['one_unit_multi_brand', 'one_unit_one_brand', 'one_unit_no_brand'])(
    'refuses a second unit in %s',
    async (structure) => {
      const { service, repo } = makeService({ structure });
      await expect(service.create(admin, { name: 'Hyderabad' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    },
  );
});

describe('OrgUnitsService.update', () => {
  const second: Unit = { id: 2, organizationId: 10, name: 'Hyderabad', city: null, isDefault: false, isActive: true };
  const base = { id: 1, organizationId: 10, name: 'Main unit', city: null, isDefault: true, isActive: true };

  it('renames a unit and clears its city with an empty string', async () => {
    const { service } = makeService({ units: [base, { ...second, city: 'Old' }] });
    const updated = await service.update(admin, 2, { name: 'Shamshabad', city: '' });
    expect(updated.name).toBe('Shamshabad');
    expect(updated.city).toBeNull();
  });

  it('never deactivates the default unit', async () => {
    const { service } = makeService({ units: [base, second] });
    await expect(service.update(admin, 1, { isActive: false })).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to deactivate a unit that still has active brands', async () => {
    const { service } = makeService({ units: [base, second], activeBrands: 2 });
    await expect(service.update(admin, 2, { isActive: false })).rejects.toBeInstanceOf(ConflictException);
  });

  it('deactivates an empty unit', async () => {
    const { service } = makeService({ units: [base, second], activeBrands: 0 });
    const updated = await service.update(admin, 2, { isActive: false });
    expect(updated.isActive).toBe(false);
  });

  it("does not reveal another organization's unit", async () => {
    const { service } = makeService({ units: [base, { ...second, organizationId: 99 }] });
    await expect(service.update(admin, 2, { name: 'x' })).rejects.toThrow('Unit not found');
  });
});

describe('OrgUnitsService.resolveActiveUnitId', () => {
  it('uses the default unit when none is requested', async () => {
    const { service } = makeService();
    await expect(service.resolveActiveUnitId(10, undefined)).resolves.toBe(1);
  });

  it('rejects a unit from another organization or an inactive one', async () => {
    const units: Unit[] = [
      { id: 1, organizationId: 10, name: 'Main', city: null, isDefault: true, isActive: true },
      { id: 2, organizationId: 20, name: 'Other org', city: null, isDefault: true, isActive: true },
      { id: 3, organizationId: 10, name: 'Closed', city: null, isDefault: false, isActive: false },
    ];
    const { service } = makeService({ units });
    await expect(service.resolveActiveUnitId(10, 2)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolveActiveUnitId(10, 3)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolveActiveUnitId(10, 1)).resolves.toBe(1);
  });
});
