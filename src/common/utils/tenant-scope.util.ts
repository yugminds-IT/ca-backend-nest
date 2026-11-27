import { ForbiddenException } from '@nestjs/common';
import { User } from '../../entities/user.entity';
import { RoleName } from '../enums/role.enum';

export interface TenantScope {
  /** null means every organization (master admin only) */
  organizationId: number | null;
  /** Set for portal (CLIENT) users: they may only see the record linked to this user id */
  ownUserId: number | null;
}

/**
 * The single place that decides which organization and which records a user may read.
 *
 * - MASTER_ADMIN: every organization, optionally narrowed to `requestedOrgId`.
 * - CLIENT (portal user): their own organization, and only the record linked to their login.
 * - Anyone else: their own organization.
 *
 * Asking for another organization's id throws 403.
 */
export function resolveTenantScope(
  user: User,
  requestedOrgId?: number | null,
): TenantScope {
  if (user.role?.name === RoleName.MASTER_ADMIN) {
    return { organizationId: requestedOrgId ?? null, ownUserId: null };
  }
  if (!user.organizationId) {
    throw new ForbiddenException('You must belong to an organization');
  }
  if (requestedOrgId != null && requestedOrgId !== user.organizationId) {
    throw new ForbiddenException('Access denied');
  }
  const isPortalUser = user.role?.name === RoleName.CLIENT;
  return {
    organizationId: user.organizationId,
    ownUserId: isPortalUser ? user.id : null,
  };
}
