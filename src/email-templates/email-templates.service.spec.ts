import { ForbiddenException } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { RoleName } from '../common/enums/role.enum';
import { mockRepo, MockRepo, userWith } from '../test-utils';

describe('EmailTemplatesService modify permissions', () => {
  let repo: MockRepo;
  let service: EmailTemplatesService;
  const global = () => ({ id: 1, organizationId: null, subject: 'S', body: 'B' });
  const own = () => ({ id: 2, organizationId: 10, subject: 'S', body: 'B' });
  const other = () => ({ id: 3, organizationId: 99, subject: 'S', body: 'B' });

  beforeEach(() => {
    repo = mockRepo();
    service = new EmailTemplatesService(repo as any, mockRepo() as any, mockRepo() as any, {} as any, {} as any);
  });

  it.each([RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE])('%s cannot update or delete a shared template', async (role) => {
    const user = userWith(role);
    repo.findOne.mockResolvedValue(global());
    await expect(service.update(1, { subject: 'X' } as any, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(1, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('org user can still read a shared template', async () => {
    repo.findOne.mockResolvedValue(global());
    await expect(service.findOne(1, userWith(RoleName.ORG_ADMIN))).resolves.toMatchObject({ id: 1 });
  });

  it('org user can update and delete their own template', async () => {
    const user = userWith(RoleName.ORG_ADMIN);
    repo.findOne.mockResolvedValue(own());
    await expect(service.update(2, { subject: 'X' } as any, user)).resolves.toMatchObject({ subject: 'X' });
    await service.remove(2, user);
    expect(repo.remove).toHaveBeenCalled();
  });

  it("org user cannot update another org's template", async () => {
    repo.findOne.mockResolvedValue(other());
    await expect(service.update(3, { subject: 'X' } as any, userWith(RoleName.ORG_ADMIN))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('master admin can update a shared template', async () => {
    repo.findOne.mockResolvedValue(global());
    await expect(service.update(1, { subject: 'X' } as any, userWith(RoleName.MASTER_ADMIN))).resolves.toMatchObject({
      subject: 'X',
    });
  });
});
