import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsObject, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RoleName } from '../common/enums/role.enum';
import { User } from '../entities/user.entity';
import { requireOrgScope } from '../leads/lead-scope.util';
import { BillingService } from './billing.service';
import { PLAN_KEYS, PLANS, PlanKey } from './plans';

class ChangePlanDto {
  @IsIn(PLAN_KEYS as unknown as string[])
  planKey: PlanKey;
}

class UpdateBillingDto {
  @IsOptional()
  @IsIn(PLAN_KEYS as unknown as string[])
  planKey?: PlanKey;

  @IsOptional()
  @IsObject()
  moduleOverrides?: { tds?: boolean; gst?: boolean };
}

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** The plan catalog, for pricing screens and upgrade prompts. */
  @Get('plans')
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  plans() {
    return PLAN_KEYS.map((key) => ({ key, ...PLANS[key] }));
  }

  /** This organization's plan, usage and module state. */
  @Get('me')
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  async me(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    const orgId = requireOrgScope(user, organizationId == null ? null : Number(organizationId));
    return this.billing.view(orgId);
  }

  /** The organization admin switches their own workspace to another plan. */
  @Patch('me/plan')
  @Roles(RoleName.ORG_ADMIN)
  changeMyPlan(@CurrentUser() user: User, @Body() body: ChangePlanDto) {
    const orgId = requireOrgScope(user, null);
    return this.billing.changePlan(orgId, body.planKey);
  }

  /** Master admin only: change an organization's plan or module overrides. */
  @Patch('organizations/:orgId')
  @Roles(RoleName.MASTER_ADMIN)
  update(@Param('orgId', ParseIntPipe) orgId: number, @Body() body: UpdateBillingDto) {
    return this.billing.update(orgId, { planKey: body.planKey, moduleOverrides: body.moduleOverrides });
  }
}

/** The plan list for the signup page, where nobody is signed in yet. Nothing here is private. */
@Controller('public/plans')
export class PublicPlansController {
  @Get()
  list() {
    return PLAN_KEYS.map((key) => ({ key, ...PLANS[key] }));
  }
}
