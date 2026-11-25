import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingPlan } from '../entities/pricing-plan.entity';
import { PricingPlanDto } from './pricing-plan.dto';

const ORDER = { sortOrder: 'ASC', id: 'ASC' } as const;
const REQUIRED = ['name', 'price', 'buttonText', 'buttonLink'] as const;

@Injectable()
export class PricingPlansService {
  constructor(
    @InjectRepository(PricingPlan)
    private readonly plans: Repository<PricingPlan>,
  ) {}

  listPublic() {
    return this.plans.find({ where: { isActive: true }, order: ORDER });
  }

  listAll() {
    return this.plans.find({ order: ORDER });
  }

  async create(dto: PricingPlanDto) {
    assertFilled(dto, REQUIRED);
    return this.plans.save(this.plans.create(clean(dto)));
  }

  async update(id: number, dto: PricingPlanDto) {
    assertFilled(
      dto,
      REQUIRED.filter((f) => f in dto),
    );
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Pricing plan not found');
    return this.plans.save(Object.assign(plan, clean(dto)));
  }

  async remove(id: number) {
    const { affected } = await this.plans.delete(id);
    if (!affected) throw new NotFoundException('Pricing plan not found');
    return { deleted: true };
  }
}

function assertFilled(dto: PricingPlanDto, fields: readonly string[]) {
  const missing = fields.filter(
    (f) => !(dto[f as keyof PricingPlanDto] as string | undefined)?.trim(),
  );
  if (missing.length)
    throw new BadRequestException(`Required: ${missing.join(', ')}`);
}

/** Trim text, store empty badge/trial as null, drop blank feature lines and other nulls (NOT NULL columns). */
function clean(dto: PricingPlanDto): Partial<PricingPlan> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto)) {
    if (k === 'badge' || k === 'trialText')
      out[k] = (v as string | null)?.trim() || null;
    else if (k === 'features')
      out[k] = (v as string[] | null)?.map((f) => f.trim()).filter(Boolean);
    else out[k] = typeof v === 'string' ? v.trim() : v;
    if (out[k] == null && k !== 'badge' && k !== 'trialText') delete out[k];
  }
  return out as Partial<PricingPlan>;
}
