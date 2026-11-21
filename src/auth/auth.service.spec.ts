import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { RoleName } from '../common/enums/role.enum';
import { mockRepo, MockRepo, userWith } from '../test-utils';

describe('AuthService', () => {
  let users: MockRepo, roles: MockRepo, orgs: MockRepo, otps: MockRepo;
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let email: { sendOtp: jest.Mock };
  let activity: { log: jest.Mock; getLastLogin: jest.Mock };
  let service: AuthService;

  /** Make the login query builder return `user`. */
  function loginFinds(user: unknown) {
    const qb: any = {};
    for (const m of ['addSelect', 'leftJoinAndSelect', 'where'])
      qb[m] = jest.fn(() => qb);
    qb.getOne = jest.fn().mockResolvedValue(user);
    users.createQueryBuilder.mockReturnValue(qb);
  }

  beforeEach(() => {
    users = mockRepo();
    roles = mockRepo();
    orgs = mockRepo();
    otps = mockRepo();
    jwt = { sign: jest.fn((p: any) => `token-${p.type}`), verify: jest.fn() };
    email = { sendOtp: jest.fn() };
    activity = { log: jest.fn(), getLastLogin: jest.fn() };
    service = new AuthService(
      users as any,
      roles as any,
      orgs as any,
      otps as any,
      mockRepo() as any,
      mockRepo() as any,
      jwt as any,
      email as any,
      activity as any,
    );
  });

  describe('login', () => {
    const password = 'Secret#123';
    let hash: string;
    beforeAll(async () => {
      hash = await bcrypt.hash(password, 4);
    });

    it('returns access and refresh tokens without the password hash', async () => {
      loginFinds(userWith(RoleName.ORG_ADMIN, { passwordHash: hash } as any));

      const res = await service.login({ email: 'U@Example.com', password });

      expect(res.accessToken).toBe('token-access');
      expect(res.refreshToken).toBe('token-refresh');
      expect(res.user).not.toHaveProperty('passwordHash');
      expect(jwt.sign.mock.calls[0][0]).toMatchObject({
        sub: 1,
        role: RoleName.ORG_ADMIN,
        organizationId: 10,
      });
      expect(activity.log).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'login', isError: false }),
      );
    });

    it.each([
      ['unknown email', null],
      ['account without a password', { id: 2, email: 'x' }],
    ])('rejects an %s with the same generic message', async (_, user) => {
      loginFinds(user);
      await expect(service.login({ email: 'x@y.z', password })).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
    });

    it('rejects a wrong password and logs the failure', async () => {
      loginFinds(userWith(RoleName.ORG_ADMIN, { passwordHash: hash } as any));
      await expect(
        service.login({ email: 'u@example.com', password: 'nope' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(activity.log).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'login_failed', isError: true }),
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('blocks users of an organization that is not approved yet', async () => {
      loginFinds(
        userWith(RoleName.ORG_ADMIN, {
          passwordHash: hash,
          organization: { id: 10, name: 'F', approvalStatus: 'pending' },
        } as any),
      );
      await expect(
        service.login({ email: 'u@example.com', password }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refresh', () => {
    it('rejects an access token used as a refresh token', async () => {
      jwt.verify.mockReturnValue({ sub: 1, type: 'access' });
      await expect(service.refresh('t')).rejects.toThrow(
        new UnauthorizedException('Invalid token type'),
      );
    });

    it('rejects an invalid token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('bad');
      });
      await expect(service.refresh('t')).rejects.toThrow(UnauthorizedException);
    });

    it('issues new tokens for a valid refresh token', async () => {
      jwt.verify.mockReturnValue({ sub: 1, type: 'refresh' });
      users.findOne.mockResolvedValue(userWith(RoleName.CAA));
      await expect(service.refresh('t')).resolves.toMatchObject({
        accessToken: 'token-access',
      });
    });
  });

  describe('signupMasterAdmin', () => {
    beforeEach(() => {
      users.findOne.mockResolvedValue(null);
      roles.findOne.mockResolvedValue({ id: 1, name: RoleName.MASTER_ADMIN });
    });

    it('is closed once a master admin exists', async () => {
      users.count.mockResolvedValue(1);
      await expect(
        service.signupMasterAdmin({
          email: 'a@b.c',
          password: 'Secret#123',
        } as any),
      ).rejects.toThrow(
        new ForbiddenException('Master admin signup is closed'),
      );
      expect(users.save).not.toHaveBeenCalled();
    });

    it('creates the first master admin', async () => {
      users.count.mockResolvedValue(0);
      users.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(userWith(RoleName.MASTER_ADMIN));
      await expect(
        service.signupMasterAdmin({
          email: 'A@B.c',
          password: 'Secret#123',
        } as any),
      ).resolves.toHaveProperty('accessToken');
      expect(users.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'a@b.c',
          roleId: 1,
          organizationId: null,
        }),
      );
    });
  });

  describe('register', () => {
    it('refuses an existing email and an org role without an organization', async () => {
      users.findOne.mockResolvedValueOnce({ id: 5 });
      await expect(
        service.register({
          email: 'a@b.c',
          password: 'x',
          roleName: RoleName.CAA,
        }),
      ).rejects.toThrow(ConflictException);

      users.findOne.mockResolvedValueOnce(null);
      roles.findOne.mockResolvedValueOnce({ id: 3, name: RoleName.CAA });
      await expect(
        service.register({
          email: 'a@b.c',
          password: 'x',
          roleName: RoleName.CAA,
        }),
      ).rejects.toThrow(
        new BadRequestException('organizationId required for this role'),
      );
    });
  });

  describe('password reset', () => {
    it('does not reveal whether an email exists', async () => {
      users.findOne.mockResolvedValue(null);
      const res = await service.forgotPassword('nobody@x.com');
      expect(res.message).toMatch(/If an account exists/);
      expect(email.sendOtp).not.toHaveBeenCalled();
    });

    it('sends a 6-digit OTP to a known user', async () => {
      users.findOne.mockResolvedValue({ id: 1 });
      await service.forgotPassword('U@x.com');
      expect(email.sendOtp).toHaveBeenCalledWith(
        'u@x.com',
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('rejects an expired OTP and deletes it', async () => {
      const record = { otp: '123456', expiresAt: new Date(Date.now() - 1000) };
      otps.findOne.mockResolvedValue(record);
      await expect(
        service.resetPassword('u@x.com', '123456', 'NewPass#1'),
      ).rejects.toThrow('OTP has expired');
      expect(otps.remove).toHaveBeenCalledWith(record);
    });

    it('sets a new hash, clears the stored plain password and consumes the OTP', async () => {
      otps.findOne.mockResolvedValue({
        otp: '123456',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const user: any = {
        id: 1,
        passwordHash: 'old',
        encryptedPlainPassword: 'enc',
      };
      users.findOne.mockResolvedValue(user);

      await service.resetPassword('u@x.com', '123456', 'NewPass#1');

      expect(await bcrypt.compare('NewPass#1', user.passwordHash)).toBe(true);
      expect(user.encryptedPlainPassword).toBeNull();
      expect(otps.delete).toHaveBeenCalledWith({
        email: 'u@x.com',
        type: 'password_reset',
      });
    });
  });
});
