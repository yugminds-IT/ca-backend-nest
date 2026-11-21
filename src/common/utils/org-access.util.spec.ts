import { ForbiddenException } from '@nestjs/common';
import { assertOrganizationAccess } from './org-access.util';
import { RoleName } from '../enums/role.enum';
import { userWith } from '../../test-utils';

const withOrg = (org: object, role = RoleName.ORG_ADMIN) =>
  userWith(role, { organization: { id: 10, name: 'F', ...org } } as any);

describe('assertOrganizationAccess', () => {
  it('allows an approved organization with no or a future end date', () => {
    expect(() =>
      assertOrganizationAccess(
        withOrg({ approvalStatus: 'approved', accessUntil: null }),
      ),
    ).not.toThrow();
    expect(() =>
      assertOrganizationAccess(
        withOrg({
          approvalStatus: 'approved',
          accessUntil: new Date(Date.now() + 60_000),
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ['rejected', { approvalStatus: 'rejected' }, /not approved/],
    ['pending', { approvalStatus: 'pending' }, /pending approval/],
    ['missing status', { approvalStatus: null }, /pending approval/],
    [
      'expired',
      { approvalStatus: 'approved', accessUntil: new Date(Date.now() - 1000) },
      /trial or subscription has ended/,
    ],
  ])('blocks a %s organization', (_, org, message) => {
    expect(() => assertOrganizationAccess(withOrg(org))).toThrow(
      ForbiddenException,
    );
    expect(() => assertOrganizationAccess(withOrg(org))).toThrow(message);
  });

  it('never blocks master admins or users without an organization', () => {
    expect(() =>
      assertOrganizationAccess(
        withOrg({ approvalStatus: 'rejected' }, RoleName.MASTER_ADMIN),
      ),
    ).not.toThrow();
    expect(() =>
      assertOrganizationAccess(userWith(RoleName.MASTER_ADMIN)),
    ).not.toThrow();
  });
});
