import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ClientsService } from './clients.service';
import { RoleName } from '../common/enums/role.enum';
import { decryptPlainPassword } from '../common/encryption';
import { mockRepo, MockRepo, userWith } from '../test-utils';

describe('ClientsService', () => {
  let clients: MockRepo,
    users: MockRepo,
    roles: MockRepo,
    orgs: MockRepo,
    services: MockRepo,
    directors: MockRepo;
  let service: ClientsService;
  const orgAdmin = userWith(RoleName.ORG_ADMIN); // organizationId 10
  const master = userWith(RoleName.MASTER_ADMIN);

  beforeAll(() => {
    process.env.SECRET_KEY = 'test-secret';
  });

  beforeEach(() => {
    clients = mockRepo();
    users = mockRepo();
    roles = mockRepo();
    orgs = mockRepo();
    services = mockRepo();
    directors = mockRepo();
    service = new ClientsService(
      clients as any,
      users as any,
      roles as any,
      orgs as any,
      services as any,
      directors as any,
    );
  });

  describe('create', () => {
    it('refuses a client for another organization', async () => {
      await expect(
        service.create({ organizationId: 99, name: 'X' } as any, orgAdmin),
      ).rejects.toThrow(ForbiddenException);
      expect(clients.save).not.toHaveBeenCalled();
    });

    it('lets a master admin create in any organization', async () => {
      await service.create({ organizationId: 99, name: 'X' } as any, master);
      expect(clients.save).toHaveBeenCalled();
    });
  });

  describe('createWithLogin', () => {
    beforeEach(() => {
      users.findOne.mockResolvedValue(null);
      roles.findOne.mockResolvedValue({ id: 4, name: RoleName.CLIENT });
      clients.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id }),
      );
    });

    it("creates the login in the caller's own organization, ignoring any organizationId sent", async () => {
      const res = await service.createWithLogin(
        { email: 'Asha@X.com', organizationId: 99 } as any,
        orgAdmin,
      );

      expect(res.email).toBe('asha@x.com');
      const savedUser = users.save.mock.calls[0][0];
      expect(savedUser).toMatchObject({
        email: 'asha@x.com',
        roleId: 4,
        organizationId: 10,
        name: 'asha',
      });
      expect(
        await bcrypt.compare(res.generatedPassword, savedUser.passwordHash),
      ).toBe(true);
      const createdUser = await users.save.mock.results[0].value;
      expect(clients.save).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 10, userId: createdUser.id }),
      );
    });

    it('generates a 12-character password and stores it decryptably (current product behavior)', async () => {
      const res = await service.createWithLogin(
        { email: 'a@x.com' } as any,
        orgAdmin,
      );
      expect(res.generatedPassword).toMatch(/^[A-Za-z2-9]{12}$/);
      const stored = users.save.mock.calls.at(-1)![0].encryptedPlainPassword;
      expect(stored).not.toContain(res.generatedPassword);
      expect(decryptPlainPassword(stored)).toBe(res.generatedPassword);
    });

    it('requires an organization for master admins and refuses duplicates in the same org', async () => {
      await expect(
        service.createWithLogin({ email: 'a@x.com' } as any, master),
      ).rejects.toThrow(BadRequestException);

      users.findOne.mockResolvedValue({ id: 7 });
      await expect(
        service.createWithLogin({ email: 'a@x.com' } as any, orgAdmin),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses users that belong to no organization', async () => {
      const orphan = userWith(RoleName.CAA, { organizationId: null } as any);
      await expect(
        service.createWithLogin({ email: 'a@x.com' } as any, orphan),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('onboard', () => {
    it('saves trimmed directors, skips nameless ones and links services', async () => {
      services.findBy.mockResolvedValue([{ id: 1 }]);
      clients.findOne.mockResolvedValue({ id: 100, directors: [] });

      await service.onboard(
        {
          name: 'Asha',
          email: 'A@X.com',
          serviceIds: [1],
          onboardDate: '2026-03-05',
          directors: [
            { directorName: '  Ravi ', email: ' r@x.com ', din: '' },
            { directorName: '   ' },
          ],
        } as any,
        orgAdmin,
      );

      expect(clients.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 10,
          email: 'a@x.com',
          status: 'active',
          onboardDate: new Date('2026-03-05'),
        }),
      );
      expect(directors.save).toHaveBeenCalledTimes(1);
      expect(directors.create).toHaveBeenCalledWith(
        expect.objectContaining({
          directorName: 'Ravi',
          email: 'r@x.com',
          din: null,
        }),
      );
      expect(services.findBy).toHaveBeenCalledWith([{ id: 1 }]);
    });
  });

  describe('findOne', () => {
    it("denies access to another organization's client", async () => {
      clients.findOne.mockResolvedValue({ id: 1, organizationId: 99 });
      await expect(service.findOne(1, orgAdmin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets a client user see only their own record', async () => {
      clients.findOne.mockResolvedValue({
        id: 1,
        organizationId: 10,
        userId: 555,
      });
      const clientUser = userWith(RoleName.CLIENT, { id: 556 } as any);
      await expect(service.findOne(1, clientUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.findOne(1, userWith(RoleName.CLIENT, { id: 555 } as any)),
      ).resolves.toMatchObject({ id: 1 });
    });
  });

  describe('findAll', () => {
    it('returns nothing when an org user asks for another organization', async () => {
      await expect(service.findAll(orgAdmin, '99')).resolves.toEqual([]);
      expect(clients.find).not.toHaveBeenCalled();
    });
  });
});
