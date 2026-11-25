import { BadRequestException } from '@nestjs/common';
import { applyTagChange, normalizeTags } from './tags';
import { ClientsService } from './clients.service';
import { RoleName } from '../common/enums/role.enum';
import { mockRepo, userWith } from '../test-utils';

describe('tags', () => {
  it('normalizes: trims, single spaces, drops blanks and case-insensitive repeats', () => {
    expect(normalizeTags(['  VIP ', 'vip', 'Class   10', '', '   '])).toEqual(['VIP', 'Class 10']);
  });

  it('adds then removes, keeping the spelling the client already has', () => {
    expect(applyTagChange(['VIP', 'Lead'], ['vip', 'Class 10'], ['LEAD'])).toEqual(['VIP', 'Class 10']);
  });
});

describe('ClientsService tags', () => {
  const orgAdmin = userWith(RoleName.ORG_ADMIN); // organizationId 10
  let clients: ReturnType<typeof mockRepo>;
  let service: ClientsService;

  beforeEach(() => {
    clients = mockRepo();
    service = new ClientsService(clients as any, mockRepo() as any, mockRepo() as any, mockRepo() as any, mockRepo() as any, mockRepo() as any);
  });

  it('bulk tags only clients in the caller’s organization, and only those that change', async () => {
    clients.find.mockResolvedValue([
      { id: 1, organizationId: 10, tags: ['Lead'] },
      { id: 2, organizationId: 10, tags: ['VIP'] },
      { id: 3, organizationId: 99, tags: [] },
    ]);
    const res = await service.bulkTag({ clientIds: [1, 2, 3, 1], add: ['vip'] }, orgAdmin);
    expect(res).toEqual({ updated: 1 });
    expect(clients.update.mock.calls).toEqual([[{ id: 1 }, { tags: ['Lead', 'vip'] }]]);
  });

  it('needs something to add or remove', async () => {
    await expect(service.bulkTag({ clientIds: [1] }, orgAdmin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a client editing their own record cannot change their tags', async () => {
    const own = { id: 5, organizationId: 10, userId: 7, tags: ['Overdue'], directors: [] };
    clients.findOne.mockResolvedValue(own);
    await service.update(5, { tags: [] } as any, userWith(RoleName.CLIENT, { id: 7 }));
    expect(own.tags).toEqual(['Overdue']);
    clients.findOne.mockResolvedValue({ ...own });
    const saved = clients.save.mock.calls.length;
    await service.update(5, { tags: [' VIP '] } as any, orgAdmin);
    expect(clients.save.mock.calls.slice(saved).at(-1)![0].tags).toEqual(['VIP']);
  });
});
