import { DeveloperController } from './developer.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { REQUIRE_PERMISSIONS_KEY } from '../access/require.decorator';

/**
 * Regression guard: every developer route that is not explicitly @Public() must declare
 * allowed roles. Before this, 17 authenticated routes accepted any logged-in user,
 * including portal (CLIENT) users.
 */
describe('DeveloperController route authorization', () => {
  const proto = DeveloperController.prototype;
  const handlers = Object.getOwnPropertyNames(proto).filter(
    (name) => name !== 'constructor',
  );

  it('covers the expected number of handlers', () => {
    expect(handlers.length).toBeGreaterThanOrEqual(17);
  });

  it.each(handlers)('%s is either public or role-restricted', (name) => {
    const handler = (proto as unknown as Record<string, unknown>)[name];
    const isPublic =
      Reflect.getMetadata(IS_PUBLIC_KEY, handler as object) === true;
    if (isPublic) return;
    const roles = Reflect.getMetadata(ROLES_KEY, handler as object) as
      | string[]
      | undefined;
    expect(roles && roles.length > 0).toBe(true);
    // Roles metadata is only enforced when RolesGuard is attached to the handler.
    const guards = Reflect.getMetadata('__guards__', handler as object) as
      | unknown[]
      | undefined;
    expect(guards).toContain(RolesGuard);
  });

  it('never grants secret-key or webhook management to CLIENT portal users; staff roles also need developer.manage', () => {
    const adminOnly = [
      'listApiKeys',
      'createApiKey',
      'updateApiKey',
      'revokeApiKey',
      'listWebhooks',
      'createWebhook',
      'deleteWebhook',
    ];
    for (const name of adminOnly) {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        (proto as unknown as Record<string, object>)[name],
      ) as string[];
      expect(roles).not.toContain('CLIENT');
      // Staff roles can reach these only through a permission profile that grants developer.manage.
      if (roles.includes('ORG_EMPLOYEE') || roles.includes('CAA')) {
        const handler = (proto as unknown as Record<string, object>)[name];
        expect(Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler)).toContain('developer.manage');
      }
    }
  });
});
