import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CustomVariablesService } from './custom-variables.service';
import { RoleName } from '../common/enums/role.enum';
import { User } from '../entities/user.entity';

type Row = Record<string, unknown> & { id?: number };

/** Minimal repository stand-in. `find` returns every row; the tests control what is stored. */
function fakeRepo(rows: Row[]) {
  let nextId = 500;
  const matches = (r: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === 'object' ? true : r[k] === v));
  const repo: Record<string, unknown> = {};
  repo.find = jest.fn(async () => rows.slice());
  repo.findOne = jest.fn(async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null);
  repo.create = jest.fn((x: Row) => ({ ...x }));
  repo.save = jest.fn(async (x: Row) => {
    if (!x.id) x.id = nextId++;
    const idx = rows.findIndex((r) => r.id === x.id);
    if (idx >= 0) rows[idx] = x;
    else rows.push(x);
    return x;
  });
  repo.update = jest.fn(async (where: Row, patch: Row) => {
    rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, patch));
    return { affected: 1 };
  });
  repo.delete = jest.fn(async (where: Row) => {
    for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
    return { affected: 1 };
  });
  repo.remove = jest.fn(async (x: Row) => {
    const idx = rows.indexOf(x);
    if (idx >= 0) rows.splice(idx, 1);
    return x;
  });
  // list() uses the query builder; the fake returns every row, which is enough for mapping tests.
  const qb: Record<string, unknown> = {};
  for (const m of ['where', 'andWhere', 'orderBy']) qb[m] = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => rows.slice());
  repo.createQueryBuilder = jest.fn(() => qb);
  repo.manager = {
    transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb({ getRepository: () => repo })),
  };
  return { repo, rows };
}

const staff = (role: RoleName = RoleName.ORG_EMPLOYEE): User =>
  ({ id: 7, organizationId: 1, role: { name: role } }) as unknown as User;

function build(opts: { variables?: Row[]; values?: Row[]; clients?: Row[] } = {}) {
  const vars = fakeRepo(opts.variables ?? []);
  const values = fakeRepo(opts.values ?? []);
  const clients = fakeRepo(opts.clients ?? [{ id: 10, organizationId: 1 }]);
  const businessUnits = { resolveUnitId: jest.fn(async (_org: number, id: number | null) => id ?? 1) };
  const service = new CustomVariablesService(
    vars.repo as never,
    values.repo as never,
    clients.repo as never,
    businessUnits as never,
  );
  return { service, vars, values };
}

describe('CustomVariablesService', () => {
  it('rejects keys that are not valid or already taken', async () => {
    const { service } = build({ variables: [{ id: 1, organizationId: 1, key: 'meeting_link' }] });
    await expect(
      service.create(staff(RoleName.ORG_ADMIN), { label: 'x', key: 'Bad Key', organizationId: 1 } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(staff(RoleName.ORG_ADMIN), { label: 'Meeting link', organizationId: 1 } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('derives a key from the label when none is given', async () => {
    const { service } = build();
    const created = await service.create(staff(RoleName.ORG_ADMIN), {
      label: 'Discount code',
      organizationId: 1,
    } as never);
    expect(created.key).toBe('discount_code');
  });

  it('upserts a non-empty value and clears on empty', async () => {
    const { service, values } = build({
      variables: [
        { id: 1, organizationId: 1, key: 'meeting_link' },
        { id: 2, organizationId: 1, key: 'discount' },
      ],
      values: [{ id: 90, variableId: 2, clientId: 10, value: '15%' }],
    });

    const result = await service.setClientValues(staff(), 10, {
      meeting_link: ' https://meet.example/abc ',
      discount: '',
    });

    expect(result).toEqual({ saved: 1, cleared: 1 });
    expect(values.rows.find((r) => r.variableId === 1)).toMatchObject({
      clientId: 10,
      value: 'https://meet.example/abc',
    });
    expect(values.rows.find((r) => r.variableId === 2)).toBeUndefined();
  });

  it('rejects unknown variable keys instead of ignoring them', async () => {
    const { service, values } = build({ variables: [{ id: 1, organizationId: 1, key: 'meeting_link' }] });
    await expect(service.setClientValues(staff(), 10, { meeting_link: 'x', typo: 'y' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(values.rows).toHaveLength(0);
  });

  it('refuses clients that belong to another organization', async () => {
    const { service } = build({
      variables: [{ id: 1, organizationId: 1, key: 'meeting_link' }],
      clients: [{ id: 10, organizationId: 2 }],
    });
    await expect(service.setClientValues(staff(), 10, { meeting_link: 'x' })).rejects.toThrow('Client not found');
  });

  it('client users cannot manage variables', async () => {
    const { service } = build({ variables: [{ id: 1, organizationId: 1, key: 'meeting_link' }] });
    await expect(
      service.update(staff(RoleName.CLIENT), 1, { label: 'x' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('list returns values keyed by client id', async () => {
    const { service } = build({
      variables: [{ id: 1, organizationId: 1, key: 'meeting_link', label: 'Meeting link', defaultValue: '', businessUnitId: null }],
      values: [{ id: 5, variableId: 1, clientId: 10, value: 'https://a' }],
    });
    const [view] = await service.list(staff(RoleName.ORG_ADMIN), undefined, undefined);
    expect(view.values).toEqual({ '10': 'https://a' });
  });
});
