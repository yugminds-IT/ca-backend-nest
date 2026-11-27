import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { AccessContext, scopeOwnerIds } from './permissions';

/**
 * Narrows a lead query to the caller's data scope. `alias` is the lead table alias in the query.
 * A "units" user with no unit memberships sees nothing, deliberately.
 */
export function applyLeadScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  ctx: AccessContext,
  alias = 'l',
): SelectQueryBuilder<T> {
  if (ctx.dataScope === 'units') {
    if (ctx.unitIds.length === 0) return qb.andWhere('1 = 0');
    return qb.andWhere(`${alias}.businessUnitId IN (:...scopeUnitIds)`, {
      scopeUnitIds: ctx.unitIds,
    });
  }
  if (ctx.dataScope === 'own') {
    return qb.andWhere(`${alias}.ownerUserId = :scopeUserId`, { scopeUserId: ctx.userId });
  }
  if (ctx.dataScope === 'team') {
    return qb.andWhere(`${alias}.ownerUserId IN (:...scopeOwnerIds)`, {
      scopeOwnerIds: scopeOwnerIds(ctx),
    });
  }
  return qb;
}
