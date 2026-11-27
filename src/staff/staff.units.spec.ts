import { StaffService } from './staff.service';

type Row = Record<string, any>;

function repo(rows: Row[] = []) {
  return {
    rows,
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => rows),
    save: jest.fn(async (x: Row | Row[]) => x),
    create: jest.fn((x: Row) => x),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
}

function build() {
  const users = repo();
  users.save = jest.fn(async (x: Row | Row[]) => ({ id: 50, ...(x as Row) }));
  const memberships = repo();
  const unitMemberships = repo();
  const businessUnits = {
    resolveUnitId: jest.fn(async (_o: number, id: number) => id),
    ensureDefault: jest.fn(async () => ({ id: 1 })),
  };
  const orgUnits = { idsInOrg: jest.fn(async (_o: number, ids: number[]) => ids) };
  const service = new StaffService(
    { assertLimit: jest.fn(async () => undefined) } as never,
    users as never,
    { ...repo(), findOne: jest.fn(async () => ({ id: 3, name: 'ORG_EMPLOYEE' })) } as never,
    repo() as never,
    repo() as never,
    memberships as never,
    { profileInOrg: jest.fn(async () => ({ id: 1, name: 'Manager' })), listProfiles: jest.fn(async () => []) } as never,
    businessUnits as never,
    { sendMail: jest.fn(async () => true) } as never,
    { list: jest.fn(async () => []), assertInOrg: jest.fn() } as never,
    { record: jest.fn(async () => undefined) } as never,
    unitMemberships as never,
    orgUnits as never,
  );
  return { service, memberships, unitMemberships, businessUnits };
}

const admin = { id: 1, organizationId: 9, role: { name: 'ORG_ADMIN' }, organization: { name: 'SSRFM' } } as never;
const invite = { name: 'Asha', email: 'asha@example.com', mode: 'temporary_password' as const };

describe('StaffService.invite with units', () => {
  it('a whole unit alone is enough: no default brand is added on top', async () => {
    const { service, memberships, unitMemberships, businessUnits } = build();
    await service.invite(admin, { ...invite, orgUnitIds: [4] });
    expect(unitMemberships.save).toHaveBeenCalledWith([{ userId: 50, orgUnitId: 4 }]);
    expect(memberships.save).not.toHaveBeenCalled();
    expect(businessUnits.ensureDefault).not.toHaveBeenCalled();
  });

  it('keeps picked brands and whole units side by side', async () => {
    const { service, memberships, unitMemberships } = build();
    await service.invite(admin, { ...invite, orgUnitIds: [4], businessUnitIds: [10, 11] });
    expect(memberships.save).toHaveBeenCalledWith([
      { userId: 50, businessUnitId: 10 },
      { userId: 50, businessUnitId: 11 },
    ]);
    expect(unitMemberships.save).toHaveBeenCalledWith([{ userId: 50, orgUnitId: 4 }]);
  });

  it('still falls back to the default brand when nothing is picked', async () => {
    const { service, memberships, unitMemberships } = build();
    await service.invite(admin, invite);
    expect(memberships.save).toHaveBeenCalledWith([{ userId: 50, businessUnitId: 1 }]);
    expect(unitMemberships.save).not.toHaveBeenCalled();
  });
});
