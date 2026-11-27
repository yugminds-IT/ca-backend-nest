import { BadRequestException } from '@nestjs/common';
import { StaffService, hashInviteToken } from './staff.service';

type Row = Record<string, any>;

function repo(rows: Row[] = []) {
  return {
    rows,
    findOne: jest.fn(async ({ where }: { where: Row }) =>
      rows.find((r) =>
        Object.entries(where).every(([k, v]) => (v === null ? r[k] == null : r[k] === v)),
      ) ?? null,
    ),
    find: jest.fn(async () => rows),
    save: jest.fn(async (x: Row | Row[]) => x),
    create: jest.fn((x: Row) => x),
    update: jest.fn(async () => ({ affected: 1 })),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
}

function build(seed: { users?: Row[]; invites?: Row[] } = {}) {
  const users = repo(seed.users ?? []);
  const invites = repo(seed.invites ?? []);
  const leads = repo([]);
  const service = new StaffService(
    { assertLimit: jest.fn(async () => undefined) } as never,
    users as never,
    repo([{ id: 3, name: 'ORG_EMPLOYEE' }]) as never,
    leads as never,
    invites as never,
    repo([]) as never,
    { profileInOrg: jest.fn(async () => ({ id: 1, name: 'Sales Executive' })), listProfiles: jest.fn(async () => [{ id: 1, name: 'Sales Executive' }]) } as never,
    { resolveUnitId: jest.fn(async (_o: number, id: number) => id), ensureDefault: jest.fn(async () => ({ id: 1 })) } as never,
    { sendMail: jest.fn(async () => true) } as never,
    { list: jest.fn(async () => []), assertInOrg: jest.fn() } as never,
    { record: jest.fn(async () => undefined) } as never,
    repo([]) as never,
    { idsInOrg: jest.fn(async (_o: number, ids: number[]) => ids) } as never,
  );
  return { service, users, invites, leads };
}

describe('StaffService.acceptInvite', () => {
  const token = 'x'.repeat(30);
  const future = new Date(Date.now() + 60_000);

  it('sets the password once and marks the invite accepted', async () => {
    const { service, users, invites } = build({
      users: [{ id: 5, isActive: true, passwordHash: 'random' }],
      invites: [{ id: 1, userId: 5, tokenHash: hashInviteToken(token), expiresAt: future, acceptedAt: null }],
    });
    await expect(service.acceptInvite({ token, password: 'long-enough-pw' })).resolves.toEqual({ success: true });
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ id: 5, passwordHash: expect.not.stringMatching('random') }));
    expect(invites.save).toHaveBeenCalledWith(expect.objectContaining({ acceptedAt: expect.any(Date) }));
  });

  it('refuses a reused, expired, or unknown token with one generic message', async () => {
    const used = build({
      users: [{ id: 5, isActive: true }],
      invites: [{ id: 1, userId: 5, tokenHash: hashInviteToken(token), expiresAt: future, acceptedAt: new Date() }],
    });
    await expect(used.service.acceptInvite({ token, password: 'long-enough-pw' })).rejects.toBeInstanceOf(BadRequestException);

    const expired = build({
      users: [{ id: 5, isActive: true }],
      invites: [{ id: 1, userId: 5, tokenHash: hashInviteToken(token), expiresAt: new Date(0), acceptedAt: null }],
    });
    await expect(expired.service.acceptInvite({ token, password: 'long-enough-pw' })).rejects.toBeInstanceOf(BadRequestException);

    const unknown = build();
    await expect(unknown.service.acceptInvite({ token, password: 'long-enough-pw' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('StaffService.update (deactivation)', () => {
  const admin = { id: 1, organizationId: 9, role: { name: 'ORG_ADMIN' } } as never;

  it('hands the leads to the reassignee', async () => {
    const { service, leads } = build({
      users: [
        { id: 2, organizationId: 9, isActive: true, role: { name: 'ORG_EMPLOYEE' } },
        { id: 4, organizationId: 9, isActive: true, role: { name: 'CAA' } },
      ],
    });
    await service.update(admin, 2, { isActive: false, reassignTo: 4 });
    expect(leads.update).toHaveBeenCalledWith({ organizationId: 9, ownerUserId: 2 }, { ownerUserId: 4 });
  });

  it('leaves the leads unowned when nobody is named', async () => {
    const { service, leads } = build({
      users: [{ id: 2, organizationId: 9, isActive: true, role: { name: 'ORG_EMPLOYEE' } }],
    });
    await service.update(admin, 2, { isActive: false });
    expect(leads.update).toHaveBeenCalledWith({ organizationId: 9, ownerUserId: 2 }, { ownerUserId: null });
  });

  it('does not let anyone deactivate their own account', async () => {
    const { service } = build({
      users: [{ id: 1, organizationId: 9, isActive: true, role: { name: 'ORG_ADMIN' } }],
    });
    await expect(service.update(admin, 1, { isActive: false })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('StaffService.inviteMany', () => {
  const admin = { id: 1, organizationId: 9, role: { name: 'ORG_ADMIN' } } as never;
  const csv = 'name,email,role,profile\nAsha,asha@example.com,staff,Sales Executive\n';

  it('invites nobody when any row is wrong', async () => {
    const { service, users } = build();
    await expect(
      service.inviteMany(admin, { csv: 'name,email\nAsha,not-an-email\n' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('invites each valid row and reports the result per row', async () => {
    const { service, users, invites } = build();
    const result = await service.inviteMany(admin, { csv, mode: 'email' });
    expect(result.invited).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]).toEqual(expect.objectContaining({ line: 2, ok: true, sent: true }));
    expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'asha@example.com', profileId: 1 }));
    expect(invites.save).toHaveBeenCalled();
  });

  it('reports a row whose profile does not exist without stopping the others', async () => {
    const { service } = build();
    const result = await service.inviteMany(admin, {
      csv: 'name,email,profile\nAsha,asha@example.com,Nope\n',
    });
    expect(result.invited).toBe(0);
    expect(result.results[0]).toEqual(expect.objectContaining({ ok: false, error: 'No profile named "Nope"' }));
  });
});
