import { AccessService } from './access.service';

function build(opts: { direct: number[]; wholeUnits: number[]; brandsInUnits: number[]; profile?: unknown }) {
  const memberships = { find: jest.fn(async () => opts.direct.map((id) => ({ userId: 7, businessUnitId: id }))) };
  const unitMemberships = { find: jest.fn(async () => opts.wholeUnits.map((id) => ({ userId: 7, orgUnitId: id }))) };
  const brands = { find: jest.fn(async () => opts.brandsInUnits.map((id) => ({ id }))) };
  const profiles = { findOne: jest.fn(async () => opts.profile ?? null) };
  const service = new AccessService(
    profiles as never,
    memberships as never,
    unitMemberships as never,
    brands as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, brands };
}

const employee = {
  id: 7,
  profileId: 2,
  organizationId: 1,
  role: { name: 'ORG_EMPLOYEE' },
  organization: { adminPanelEnabled: true },
} as never;
const managerProfile = { permissions: ['leads.view'], dataScope: 'units' };

describe('AccessService.contextFor brand visibility', () => {
  it('adds every brand of a whole unit to the brands picked one by one, without duplicates', async () => {
    const { service } = build({ direct: [3, 10], wholeUnits: [4], brandsInUnits: [10, 11], profile: managerProfile });
    const ctx = await service.contextFor(employee);
    expect([...ctx.unitIds].sort((a, b) => a - b)).toEqual([3, 10, 11]);
    expect(ctx.dataScope).toBe('units');
  });

  it('does not look brands up when the person holds no whole unit', async () => {
    const { service, brands } = build({ direct: [3], wholeUnits: [], brandsInUnits: [], profile: managerProfile });
    const ctx = await service.contextFor(employee);
    expect(ctx.unitIds).toEqual([3]);
    expect(brands.find).not.toHaveBeenCalled();
  });

  it('sees a brand added to the unit later, with no change to the assignment', async () => {
    const first = build({ direct: [], wholeUnits: [4], brandsInUnits: [10], profile: managerProfile });
    expect((await first.service.contextFor(employee)).unitIds).toEqual([10]);
    const later = build({ direct: [], wholeUnits: [4], brandsInUnits: [10, 12], profile: managerProfile });
    expect((await later.service.contextFor(employee)).unitIds).toEqual([10, 12]);
  });
});
