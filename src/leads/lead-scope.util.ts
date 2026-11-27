import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { resolveTenantScope } from '../common/utils/tenant-scope.util';

/** Client-portal users never touch the CRM. */
export function denyClients(user: User): void {
  if (user.role?.name === RoleName.CLIENT)
    throw new ForbiddenException('Access denied');
}

/** The organization a CRM request acts on. Master admins must name one. */
export function requireOrgScope(
  user: User,
  requestedOrgId?: number | null,
): number {
  denyClients(user);
  const scope = resolveTenantScope(user, requestedOrgId ?? null);
  if (scope.organizationId == null) {
    throw new BadRequestException(
      'organizationId is required for this request',
    );
  }
  return scope.organizationId;
}

/** Records from another organization look like "not found", not "forbidden". */
export function assertRecordInOrg(user: User, recordOrgId: number): void {
  if (user.role?.name === RoleName.MASTER_ADMIN) return;
  if (recordOrgId !== user.organizationId)
    throw new NotFoundException('Not found');
}

/** Escapes LIKE wildcards so a search for "50%" matches the literal text. */
export function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}
