import { ForbiddenException } from '@nestjs/common';
import { User } from '../../entities/user.entity';
import { RoleName } from '../enums/role.enum';

/** Enforce org approval + trial/subscription window for org-scoped users (not master admin). */
export function assertOrganizationAccess(user: User): void {
  if (!user.organizationId || !user.organization) return;
  if (user.role?.name === RoleName.MASTER_ADMIN) return;

  const org = user.organization;
  if (org.approvalStatus === 'rejected') {
    throw new ForbiddenException('Your organization registration was not approved.');
  }
  // Only explicitly approved orgs may access; anything else (pending, null, unknown) is blocked.
  if (org.approvalStatus !== 'approved') {
    throw new ForbiddenException(
      'Your organization is pending approval. You will receive an email from Team Lekvya once an administrator approves your account.',
    );
  }
  if (org.accessUntil && new Date(org.accessUntil).getTime() < Date.now()) {
    throw new ForbiddenException(
      'Your trial or subscription has ended. Please purchase a subscription or contact support.',
    );
  }
}
