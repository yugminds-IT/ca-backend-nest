import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthController } from './auth.controller';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RoleName } from '../common/enums/role.enum';

// Guards the route-level access rules: a mistake here exposes account creation to the internet.
describe('AuthController access rules', () => {
  const reflector = new Reflector();
  const handler = (name: keyof AuthController) =>
    AuthController.prototype[name] as (...a: any[]) => any;

  it.each(['register', 'signupOrgAdmin'] as const)(
    '%s requires a logged-in master admin',
    (name) => {
      expect(reflector.get(IS_PUBLIC_KEY, handler(name))).toBeUndefined();
      expect(reflector.get(ROLES_KEY, handler(name))).toEqual([
        RoleName.MASTER_ADMIN,
      ]);
      expect(reflector.get(GUARDS_METADATA, handler(name))).toContain(
        RolesGuard,
      );
    },
  );

  it.each([
    'login',
    'refresh',
    'signupOrganization',
    'signupMasterAdmin',
    'forgotPassword',
    'resetPassword',
  ] as const)('%s stays public', (name) => {
    expect(reflector.get(IS_PUBLIC_KEY, handler(name))).toBe(true);
  });
});
