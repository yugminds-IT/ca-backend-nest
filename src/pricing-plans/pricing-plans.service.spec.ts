import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PricingPlansService } from './pricing-plans.service';
import { PricingPlansController } from './pricing-plans.controller';
import { PricingPlanDto } from './pricing-plan.dto';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RoleName } from '../common/enums/role.enum';
import { mockRepo, MockRepo } from '../test-utils';

describe('PricingPlansService', () => {
  let plans: MockRepo;
  let service: PricingPlansService;
  const valid = {
    name: ' Starter ',
    price: '₹199',
    buttonText: 'Start',
    buttonLink: '/signup',
  };

  beforeEach(() => {
    plans = mockRepo();
    plans.create.mockImplementation((x: unknown) => x);
    service = new PricingPlansService(plans as any);
  });

  it('lists only active plans publicly, in display order', async () => {
    await service.listPublic();
    expect(plans.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  });

  it('creates a plan with trimmed text, null empty badge and no blank features', async () => {
    await service.create({
      ...valid,
      badge: '  ',
      features: [' A ', '', '  ', 'B'],
    });
    expect(plans.save).toHaveBeenCalledWith({
      ...valid,
      name: 'Starter',
      badge: null,
      features: ['A', 'B'],
    });
  });

  it('refuses to create or update a plan with a blank required field', async () => {
    await expect(service.create({ ...valid, price: ' ' })).rejects.toThrow(
      new BadRequestException('Required: price'),
    );
    await expect(service.update(1, { name: '  ' })).rejects.toThrow(
      BadRequestException,
    );
    expect(plans.save).not.toHaveBeenCalled();
  });

  it('updates only the fields sent and ignores nulls on NOT NULL columns', async () => {
    plans.findOne.mockResolvedValue({ id: 1, ...valid, sortOrder: 3 });
    await service.update(1, {
      price: '₹249',
      sortOrder: null as any,
      trialText: '',
    });
    expect(plans.save).toHaveBeenCalledWith({
      id: 1,
      ...valid,
      price: '₹249',
      sortOrder: 3,
      trialText: null,
    });
  });

  it('404s when updating or deleting a missing plan', async () => {
    plans.findOne.mockResolvedValue(null);
    await expect(service.update(9, { price: '1' })).rejects.toThrow(
      NotFoundException,
    );
    plans.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove(9)).rejects.toThrow(NotFoundException);
  });
});

describe('PricingPlanDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const validate = (body: object) =>
    pipe.transform(body, { type: 'body', metatype: PricingPlanDto });

  it.each(['javascript:alert(1)', '//evil.example', 'signup'])(
    'rejects button link %s',
    async (buttonLink) => {
      await expect(validate({ buttonLink })).rejects.toThrow();
    },
  );

  it.each(['/signup', '/#contact', 'https://example.com'])(
    'accepts button link %s',
    async (buttonLink) => {
      await expect(validate({ buttonLink })).resolves.toEqual({ buttonLink });
    },
  );
});

describe('PricingPlansController routes', () => {
  const reflector = new Reflector();
  const proto = PricingPlansController.prototype;

  it('serves the public list without login', () => {
    expect(reflector.get(IS_PUBLIC_KEY, proto.listPublic)).toBe(true);
  });

  it.each(['listAll', 'create', 'update', 'remove'] as const)(
    '%s requires a master admin',
    (method) => {
      expect(reflector.get(IS_PUBLIC_KEY, proto[method])).toBeUndefined();
      expect(reflector.get(ROLES_KEY, proto[method])).toEqual([
        RoleName.MASTER_ADMIN,
      ]);
    },
  );
});
