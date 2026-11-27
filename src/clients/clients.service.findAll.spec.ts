import { ClientsService } from './clients.service';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

/** Builds ClientsService with only the repositories findAll touches. */
function buildService(rows: unknown[]) {
  const find = jest.fn().mockResolvedValue(rows);
  const repo = { find } as any;
  const service = new ClientsService(
    repo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, find };
}

function user(role: RoleName, organizationId: number | null, id = 7): User {
  return { id, role: { name: role }, organizationId } as unknown as User;
}

describe('ClientsService.findAll scoping', () => {
  it('portal (CLIENT) users query only their own linked client record', async () => {
    const { service, find } = buildService([]);
    await service.findAll(user(RoleName.CLIENT, 5, 42));
    const where = find.mock.calls[0][0].where;
    expect(where).toEqual({ organizationId: 5, userId: 42 });
  });

  it('staff query every client in their organization', async () => {
    const { service, find } = buildService([]);
    await service.findAll(user(RoleName.ORG_EMPLOYEE, 5));
    expect(find.mock.calls[0][0].where).toEqual({ organizationId: 5 });
  });

  it('master admin with no organization filter queries all organizations', async () => {
    const { service, find } = buildService([]);
    await service.findAll(user(RoleName.MASTER_ADMIN, null));
    expect(find.mock.calls[0][0].where).toEqual({});
  });

  it('returns [] for a non-numeric organization id instead of querying', async () => {
    const { service, find } = buildService([]);
    await expect(
      service.findAll(user(RoleName.ORG_ADMIN, 5), 'abc'),
    ).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});
