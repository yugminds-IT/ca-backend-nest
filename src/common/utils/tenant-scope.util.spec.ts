import { ForbiddenException } from '@nestjs/common';
import { User } from '../../entities/user.entity';
import { RoleName } from '../enums/role.enum';
import { resolveTenantScope } from './tenant-scope.util';

function userWith(role: RoleName, organizationId: number | null, id = 7): User {
  return { id, role: { name: role }, organizationId } as unknown as User;
}

describe('resolveTenantScope', () => {
  it('master admin sees every organization when none is requested', () => {
    expect(
      resolveTenantScope(userWith(RoleName.MASTER_ADMIN, null), undefined),
    ).toEqual({
      organizationId: null,
      ownUserId: null,
    });
  });

  it('master admin can narrow to a requested organization', () => {
    expect(
      resolveTenantScope(userWith(RoleName.MASTER_ADMIN, null), 3)
        .organizationId,
    ).toBe(3);
  });

  it('staff are scoped to their own organization', () => {
    expect(
      resolveTenantScope(userWith(RoleName.ORG_EMPLOYEE, 5), undefined),
    ).toEqual({
      organizationId: 5,
      ownUserId: null,
    });
  });

  it('portal (CLIENT) users are limited to their own record', () => {
    expect(
      resolveTenantScope(userWith(RoleName.CLIENT, 5, 42), undefined),
    ).toEqual({
      organizationId: 5,
      ownUserId: 42,
    });
  });

  it('rejects a requested organization that is not the user’s own', () => {
    expect(() =>
      resolveTenantScope(userWith(RoleName.ORG_ADMIN, 5), 9),
    ).toThrow(ForbiddenException);
  });

  it('rejects users who belong to no organization', () => {
    expect(() =>
      resolveTenantScope(userWith(RoleName.ORG_ADMIN, null), undefined),
    ).toThrow(ForbiddenException);
  });
});
