import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrgBilling } from '../entities/org-billing.entity';
import { Organization } from '../entities/organization.entity';
import { BusinessUnit } from '../entities/business-unit.entity';
import { User } from '../entities/user.entity';
import { CustomFieldDefinition } from '../entities/custom-fields.entities';
import {
  CountedLimit,
  Entitlements,
  ModuleKey,
  ModuleOverrides,
  PLANS,
  PlanKey,
  aiCreditsRemaining,
  effectiveModules,
  isPlanKey,
  monthKeyIst,
  planBlockers,
  wouldExceed,
} from './plans';

export type Entitlement = { feature: 'automations' | 'whiteLabel' } | { module: ModuleKey };

export interface BillingView {
  planKey: PlanKey;
  planName: string;
  limits: Omit<Entitlements, 'name'>;
  usage: { units: number; users: number; customFields: number };
  ai: { used: number; limit: number; remaining: number };
  modules: Record<ModuleKey, boolean>;
  moduleOverrides: ModuleOverrides;
}

/** Plan limits, feature checks and AI credits. Every check reads the organization's own row. */
@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(OrgBilling) private readonly rows: Repository<OrgBilling>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(BusinessUnit) private readonly units: Repository<BusinessUnit>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(CustomFieldDefinition) private readonly fields: Repository<CustomFieldDefinition>,
  ) {}

  /** The org's billing row, created on Starter the first time it is needed. */
  async rowFor(orgId: number): Promise<OrgBilling> {
    const existing = await this.rows.findOne({ where: { organizationId: orgId } });
    if (existing) return existing;
    await this.rows
      .createQueryBuilder()
      .insert()
      .values({ organizationId: orgId, planKey: 'starter', moduleOverrides: {}, aiCreditsUsed: 0, aiPeriod: '' })
      .orIgnore()
      .execute();
    const row = await this.rows.findOne({ where: { organizationId: orgId } });
    if (!row) throw new NotFoundException('Organization not found');
    return row;
  }

  private planOf(row: OrgBilling): PlanKey {
    return isPlanKey(row.planKey) ? row.planKey : 'starter';
  }

  private async industryOf(orgId: number): Promise<string | null> {
    const org = await this.orgs.findOne({ where: { id: orgId }, select: ['id', 'industry'] });
    return org?.industry ?? null;
  }

  async entitlements(orgId: number): Promise<{ planKey: PlanKey; plan: Entitlements; modules: Record<ModuleKey, boolean> }> {
    const row = await this.rowFor(orgId);
    const planKey = this.planOf(row);
    const industry = await this.industryOf(orgId);
    return {
      planKey,
      plan: PLANS[planKey],
      modules: effectiveModules(industry, row.moduleOverrides as ModuleOverrides),
    };
  }

  async view(orgId: number): Promise<BillingView> {
    const row = await this.rowFor(orgId);
    const planKey = this.planOf(row);
    const plan = PLANS[planKey];
    const [units, users, customFields, industry] = await Promise.all([
      this.units.count({ where: { organizationId: orgId } }),
      this.users.count({ where: { organizationId: orgId, isActive: true } }),
      this.fields.count({ where: { organizationId: orgId } }),
      this.industryOf(orgId),
    ]);
    const { name: _name, ...limits } = plan;
    const used = this.creditsUsedThisMonth(row);
    return {
      planKey,
      planName: plan.name,
      limits,
      usage: { units, users, customFields },
      ai: { used, limit: plan.aiCreditsPerMonth, remaining: aiCreditsRemaining(planKey, used) },
      modules: effectiveModules(industry, row.moduleOverrides as ModuleOverrides),
      moduleOverrides: row.moduleOverrides as ModuleOverrides,
    };
  }

  /** Throws 402 when adding `adding` more of a counted resource would exceed the plan. */
  async assertLimit(orgId: number, metric: CountedLimit, adding = 1): Promise<void> {
    const { plan } = await this.entitlements(orgId);
    const limit = plan[metric];
    if (limit === undefined) return;
    const current =
      metric === 'units'
        ? await this.units.count({ where: { organizationId: orgId } })
        : metric === 'users'
          ? await this.users.count({ where: { organizationId: orgId, isActive: true } })
          : await this.fields.count({ where: { organizationId: orgId } });
    if (wouldExceed(limit, current, adding)) {
      throw new HttpException(
        {
          code: 'PLAN_LIMIT_REACHED',
          message: `Your ${plan.name} plan allows ${limit} ${LIMIT_NOUN[metric]}. Upgrade to add more.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /** Throws 402 when the plan lacks the feature, or 403 when a module is switched off for this workspace. */
  async assertEntitled(orgId: number, need: Entitlement): Promise<void> {
    const { plan, modules } = await this.entitlements(orgId);
    if ('feature' in need) {
      if (!plan[need.feature]) {
        throw new HttpException(
          {
            code: 'PLAN_REQUIRED',
            message: `This needs a plan that includes ${FEATURE_LABEL[need.feature]}. You are on ${plan.name}.`,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      return;
    }
    if (!modules[need.module]) {
      throw new HttpException(
        { code: 'MODULE_DISABLED', message: `${need.module.toUpperCase()} is turned off for this workspace.` },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private creditsUsedThisMonth(row: OrgBilling): number {
    return row.aiPeriod === monthKeyIst(new Date()) ? row.aiCreditsUsed : 0;
  }

  /**
   * Takes one AI credit if the plan has any left this month. Returns false (and changes nothing) otherwise.
   * The update is a single conditional statement, so two requests cannot both take the last credit.
   */
  async consumeAiCredit(orgId: number): Promise<boolean> {
    const row = await this.rowFor(orgId);
    const plan = PLANS[this.planOf(row)];
    const period = monthKeyIst(new Date());
    if (plan.aiCreditsPerMonth <= 0) return false;
    const limit = plan.aiCreditsPerMonth;
    const result = await this.rows
      .createQueryBuilder()
      .update(OrgBilling)
      .set({
        aiCreditsUsed: () => `CASE WHEN "aiPeriod" = :period THEN "aiCreditsUsed" + 1 ELSE 1 END`,
        aiPeriod: period,
      })
      .where('"organizationId" = :orgId', { orgId })
      .andWhere(':limit > 0 AND ("aiPeriod" <> :period OR "aiCreditsUsed" < :limit)', { period, limit })
      .setParameters({ period, limit })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /**
   * The organization admin moves their own workspace to another plan. Going down is refused while the
   * workspace is over the smaller plan's caps, so nothing already created is left stranded.
   */
  async changePlan(orgId: number, planKey: PlanKey): Promise<BillingView> {
    const row = await this.rowFor(orgId);
    if (this.planOf(row) === planKey) return this.view(orgId);
    const [units, users, customFields] = await Promise.all([
      this.units.count({ where: { organizationId: orgId } }),
      this.users.count({ where: { organizationId: orgId, isActive: true } }),
      this.fields.count({ where: { organizationId: orgId } }),
    ]);
    const blockers = planBlockers(planKey, { units, users, customFields });
    if (blockers.length) {
      throw new ConflictException({
        code: 'PLAN_DOWNGRADE_BLOCKED',
        message: `You can't move to ${PLANS[planKey].name} yet. ${blockers.join(' ')} Remove the extra ones first.`,
      });
    }
    row.planKey = planKey;
    await this.rows.save(row);
    return this.view(orgId);
  }

  /** Master admin: change the plan or module overrides for any organization. */
  async update(orgId: number, input: { planKey?: PlanKey; moduleOverrides?: ModuleOverrides }): Promise<BillingView> {
    const row = await this.rowFor(orgId);
    if (input.planKey !== undefined) row.planKey = input.planKey;
    if (input.moduleOverrides !== undefined) {
      const next: Record<string, boolean> = {};
      for (const key of ['tds', 'gst'] as const) {
        const v = input.moduleOverrides[key];
        if (typeof v === 'boolean') next[key] = v;
      }
      row.moduleOverrides = next;
    }
    await this.rows.save(row);
    return this.view(orgId);
  }
}

const LIMIT_NOUN: Record<CountedLimit, string> = {
  units: 'business units',
  users: 'active staff',
  customFields: 'custom fields',
};

const FEATURE_LABEL: Record<'automations' | 'whiteLabel', string> = {
  automations: 'automation',
  whiteLabel: 'white-label branding',
};
