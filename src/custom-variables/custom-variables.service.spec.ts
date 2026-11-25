import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CustomVariablesService } from './custom-variables.service';

const repo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  exist: jest.fn().mockResolvedValue(false),
  save: jest.fn(async (x) => ({ id: 1, ...x })),
  create: jest.fn((x) => x),
  delete: jest.fn(),
  upsert: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('CustomVariablesService', () => {
  let vars: ReturnType<typeof repo>, values: ReturnType<typeof repo>, clients: ReturnType<typeof repo>;
  let service: CustomVariablesService;
  const user = { organizationId: 10 } as any;

  beforeEach(() => {
    vars = repo();
    values = repo();
    clients = repo();
    service = new CustomVariablesService(vars as any, values as any, clients as any);
  });

  it('valuesFor: default, overridden by the client’s own value', async () => {
    vars.find.mockResolvedValue([
      { id: 1, key: 'meeting_link', defaultValue: 'https://default' },
      { id: 2, key: 'room', defaultValue: 'Hall A' },
      { id: 3, key: 'empty', defaultValue: '' },
    ]);
    const qb: any = {};
    for (const m of ['where', 'andWhere']) qb[m] = jest.fn(() => qb);
    qb.getOne = jest.fn().mockResolvedValue({ id: 5 });
    clients.createQueryBuilder.mockReturnValue(qb);
    values.find.mockResolvedValue([{ variableId: 1, value: 'https://client-5' }]);

    expect(await service.valuesFor(10, 'C@X.com')).toEqual({ meeting_link: 'https://client-5', room: 'Hall A' });
    expect(await service.valuesFor(null, 'c@x.com')).toEqual({});
  });

  it('create: rejects built-in keys and needs an org', async () => {
    await expect(service.create(user, { key: 'client_name', label: 'X' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ organizationId: null } as any, { key: 'room', label: 'Room' })).rejects.toBeInstanceOf(ForbiddenException);
    const v = await service.create(user, { key: 'Meeting_Link', label: ' Meeting link ' });
    expect(v).toMatchObject({ organizationId: 10, key: 'meeting_link', label: 'Meeting link', defaultValue: '', values: {} });
  });

  it('setClientValues: upserts values, empty clears, unknown keys rejected', async () => {
    clients.exist.mockResolvedValue(true);
    vars.find.mockResolvedValue([{ id: 1, key: 'meeting_link' }, { id: 2, key: 'room' }]);
    await expect(service.setClientValues(user, 5, { nope: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    expect(await service.setClientValues(user, 5, { meeting_link: ' https://x ', room: '  ' })).toEqual({ saved: 1, cleared: 1 });
    expect(values.upsert).toHaveBeenCalledWith([{ clientId: 5, variableId: 1, value: 'https://x' }], ['clientId', 'variableId']);
    expect(values.delete).toHaveBeenCalled();
  });
});
