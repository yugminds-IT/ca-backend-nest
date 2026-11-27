import 'reflect-metadata';
import { BadRequestException, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthService, MAX_OTP_ATTEMPTS } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AUTH_LIMITS, AuthRateLimit, AuthRateLimitGuard } from '../common/guards/auth-rate-limit.guard';

describe('auth routes that create privileged accounts', () => {
  const proto = AuthController.prototype as unknown as Record<string, unknown>;
  const guardsOf = (name: string) => (Reflect.getMetadata(GUARDS_METADATA, proto[name] as object) ?? []) as unknown[];
  const isPublic = (name: string) => Reflect.getMetadata(IS_PUBLIC_KEY, proto[name] as object) === true;

  it.each(['signupMasterAdmin', 'register', 'getOrganizationsForDropdown'])('%s needs a signed-in user', (name) => {
    expect(isPublic(name)).toBe(false);
    expect(guardsOf(name)).toContain(JwtAuthGuard);
  });

  it('has no public route to join an existing organization as its admin', () => {
    expect(proto.signupOrgAdmin).toBeUndefined();
  });

  it.each(['login', 'forgotPassword', 'verifyPasswordResetOtp', 'resetPassword', 'signupOrganization', 'refresh'])(
    '%s is rate limited',
    (name) => {
      expect(guardsOf(name)).toContain(AuthRateLimitGuard);
    },
  );
});

describe('AuthRateLimitGuard', () => {
  class Routes {
    @AuthRateLimit({ name: 't', limit: 2, windowMs: 60_000, by: ['email'] })
    route() {}
  }
  const guard = new AuthRateLimitGuard(new Reflector());
  const ctx = (email: string, ip = '1.1.1.1') =>
    ({
      getHandler: () => Routes.prototype.route,
      switchToHttp: () => ({
        getRequest: () => ({ ip, body: { email }, headers: { 'x-forwarded-for': `${Math.random()}` } }),
        getResponse: () => ({ setHeader: jest.fn() }),
      }),
    }) as never;

  beforeEach(() => AuthRateLimitGuard.reset());

  it('blocks after the limit for the same email, whatever IP or forwarded header is sent', () => {
    expect(guard.canActivate(ctx('a@x.com', '1.1.1.1'))).toBe(true);
    expect(guard.canActivate(ctx('A@x.com ', '2.2.2.2'))).toBe(true);
    expect(() => guard.canActivate(ctx('a@x.com', '3.3.3.3'))).toThrow(HttpException);
  });

  it('counts each email separately', () => {
    guard.canActivate(ctx('a@x.com'));
    guard.canActivate(ctx('a@x.com'));
    expect(guard.canActivate(ctx('b@x.com'))).toBe(true);
  });

  it('keeps the login limits tight enough to stop password guessing', () => {
    const perEmail = AUTH_LIMITS.login.find((r) => r.by.includes('email'))!;
    expect(perEmail.limit).toBeLessThanOrEqual(10);
  });
});

describe('password reset codes', () => {
  function build(code = '123456') {
    const record = { email: 'a@x.com', otp: code, type: 'password_reset', attempts: 0, expiresAt: new Date(Date.now() + 60_000) };
    const otpRepo = {
      findOne: jest.fn(async () => record),
      save: jest.fn(async (r: unknown) => r),
      delete: jest.fn(async () => undefined),
      remove: jest.fn(async () => undefined),
    };
    const args = Array(13).fill({});
    args[3] = otpRepo;
    const service = new (AuthService as unknown as new (...a: unknown[]) => AuthService)(...args);
    return { service, otpRepo, record };
  }

  it('accepts the right code', async () => {
    const { service } = build();
    await expect(service.verifyPasswordResetOtp('a@x.com', '123456')).resolves.toMatchObject({ verified: true });
  });

  it('counts wrong guesses and throws the code away after the limit', async () => {
    const { service, otpRepo, record } = build();
    for (let i = 1; i < MAX_OTP_ATTEMPTS; i++) {
      await expect(service.verifyPasswordResetOtp('a@x.com', '000000')).rejects.toBeInstanceOf(BadRequestException);
      expect(record.attempts).toBe(i);
    }
    await expect(service.verifyPasswordResetOtp('a@x.com', '000000')).rejects.toThrow(/Too many wrong codes/);
    expect(otpRepo.delete).toHaveBeenCalledWith({ email: 'a@x.com', type: 'password_reset' });
  });
});
