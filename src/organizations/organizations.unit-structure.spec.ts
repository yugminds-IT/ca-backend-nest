import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { RoleName } from '../common/enums/role.enum';

/** Who may change the unit and brand layout, and when narrowing it is refused. */
describe('OrganizationsService.update unitStructure', () => {
  const masterAdmin = { organizationId: null, role: { name: RoleName.MASTER_ADMIN } } as never;
  const orgAdmin = { organizationId: 10, role: { name: RoleName.ORG_ADMIN } } as never;

  function makeService(unitStructure: string, activeUnits: number, activeBrands: number) {
    const org = { id: 10, name: 'SSRFM', slug: 'ssrfm', unitStructure, adminPanelEnabled: unitStructure !== 'one_unit_no_brand' };
    const repo = {
      findOne: jest.fn(async () => org),
      save: jest.fn(async (o: unknown) => o),
    };
    const businessUnits = { countActiveForOrg: jest.fn(async () => activeBrands) };
    const orgUnits = { countActive: jest.fn(async () => activeUnits) };
    const service = new OrganizationsService(
      repo as never,
      {} as never,
      {} as never,
      businessUnits as never,
      orgUnits as never,
    );
    return { service, org, repo };
  }

  it('lets a master admin widen the layout and keeps the admin panel flag in step', async () => {
    const { service } = makeService('one_unit_no_brand', 1, 1);
    const saved = await service.update(10, { unitStructure: 'multi_unit' }, masterAdmin);
    expect(saved.unitStructure).toBe('multi_unit');
    expect(saved.adminPanelEnabled).toBe(true);
  });

  it('turns the admin panel off for the single-brand layouts', async () => {
    const { service } = makeService('multi_unit', 1, 1);
    const saved = await service.update(10, { unitStructure: 'one_unit_one_brand' }, masterAdmin);
    expect(saved.unitStructure).toBe('one_unit_one_brand');
    expect(saved.adminPanelEnabled).toBe(false);
  });

  it('keeps the admin panel on for one unit with several brands', async () => {
    const { service } = makeService('multi_unit', 1, 5);
    const saved = await service.update(10, { unitStructure: 'one_unit_multi_brand' }, masterAdmin);
    expect(saved.adminPanelEnabled).toBe(true);
  });

  it('refuses to narrow to one unit while several units are active', async () => {
    const { service, org, repo } = makeService('multi_unit', 2, 3);
    await expect(service.update(10, { unitStructure: 'one_unit_multi_brand' }, masterAdmin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(org.unitStructure).toBe('multi_unit');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('refuses a single-brand layout while several brands are active', async () => {
    const { service, repo } = makeService('one_unit_multi_brand', 1, 3);
    await expect(service.update(10, { unitStructure: 'one_unit_one_brand' }, masterAdmin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not let an org admin change it', async () => {
    const { service, org, repo } = makeService('multi_unit', 1, 1);
    await expect(service.update(10, { unitStructure: 'one_unit_no_brand' }, orgAdmin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(org.unitStructure).toBe('multi_unit');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('lets an org admin resend the current layout while saving other fields', async () => {
    const { service } = makeService('one_unit_one_brand', 1, 1);
    const saved = await service.update(10, { unitStructure: 'one_unit_one_brand', name: 'SSRFM Ltd' }, orgAdmin);
    expect(saved.name).toBe('SSRFM Ltd');
    expect(saved.unitStructure).toBe('one_unit_one_brand');
  });
});
