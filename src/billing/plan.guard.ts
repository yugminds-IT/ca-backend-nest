import { CanActivate, ExecutionContext, Injectable, BadRequestException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '../entities/user.entity';
import { resolveTenantScope } from '../common/utils/tenant-scope.util';
import { BillingService, Entitlement } from './billing.service';

export const ENTITLE_KEY = 'entitlement';

/** Route needs a plan feature or an enabled module. Use with PlanGuard, after JwtAuthGuard. */
export const Entitle = (need: Entitlement) => SetMetadata(ENTITLE_KEY, need);

/**
 * Checks the caller's organization against its plan. Master admins act on the organization named in the request.
 * Count-based limits (units, users, custom fields) are checked in the services, where the new row is created.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const need = this.reflector.getAllAndOverride<Entitlement | undefined>(ENTITLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!need) return true;
    const req = context.switchToHttp().getRequest<{ user: User; query?: Record<string, unknown>; body?: Record<string, unknown> }>();
    const requested = req.query?.organizationId ?? req.body?.organizationId;
    const orgId = resolveTenantScope(req.user, requested == null ? null : Number(requested)).organizationId;
    if (orgId == null) throw new BadRequestException('organizationId is required for this request');
    await this.billing.assertEntitled(orgId, need);
    return true;
  }
}
