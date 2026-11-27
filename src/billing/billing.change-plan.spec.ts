import { ConflictException } from '@nestjs/common';
import { BillingService } from './billing.service';

function build(opts: { plan: string; units: number; users: number; fields: number }) {
  const row = { organizationId: 7, planKey: opts.plan, moduleOverrides: {}, aiCreditsUsed: 0, aiPeriod: '' };
  const rows = { findOne: jest.fn(async () => row), save: jest.fn(async (r: unknown) => r) };
  const orgs = { findOne: jest.fn(async () => ({ id: 7, industry: 'custom' })) };
  const units = { count: jest.fn(async () => opts.units) };
  const users = { count: jest.fn(async () => opts.users) };
  const fields = { count: jest.fn(async () => opts.fields) };
  const svc = new BillingService(rows as never, orgs as never, units as never, users as never, fields as never);
  return { svc, row, rows };
}

describe('BillingService.changePlan', () => {
  it('moves the workspace up a plan and saves it', async () => {
    const { svc, row, rows } = build({ plan: 'starter', units: 1, users: 2, fields: 3 });
    const view = await svc.changePlan(7, 'growth');
    expect(row.planKey).toBe('growth');
    expect(rows.save).toHaveBeenCalledTimes(1);
    expect(view.planKey).toBe('growth');
    expect(view.limits.units).toBe(3);
  });

  it('does nothing when the plan is already the current one', async () => {
    const { svc, rows } = build({ plan: 'growth', units: 1, users: 1, fields: 1 });
    const view = await svc.changePlan(7, 'growth');
    expect(rows.save).not.toHaveBeenCalled();
    expect(view.planKey).toBe('growth');
  });

  it('allows a downgrade that still fits', async () => {
    const { svc, row } = build({ plan: 'premium', units: 1, users: 3, fields: 10 });
    await svc.changePlan(7, 'starter');
    expect(row.planKey).toBe('starter');
  });

  it('refuses a downgrade while usage is over the smaller plan, and keeps the current plan', async () => {
    const { svc, row, rows } = build({ plan: 'premium', units: 4, users: 3, fields: 10 });
    await expect(svc.changePlan(7, 'starter')).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.changePlan(7, 'starter')).rejects.toMatchObject({
      response: { code: 'PLAN_DOWNGRADE_BLOCKED' },
    });
    expect(row.planKey).toBe('premium');
    expect(rows.save).not.toHaveBeenCalled();
  });
});
