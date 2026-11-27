import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeadsService, normalizeTags } from './leads.service';
import { Lead, LeadActivity, Pipeline, PipelineStage } from '../entities/crm.entities';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

type Row = Record<string, unknown> & { id?: number };

/** In-memory stand-in for a TypeORM repository: enough for the service's calls. */
function fakeRepo(rows: Row[] = [], opts: { dupes?: Row[] } = {}) {
  let nextId = 1000;
  const repo: Record<string, unknown> = {};
  repo.findOne = jest.fn(async ({ where }: { where: Row }) =>
    rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
  );
  repo.find = jest.fn(async () => rows);
  repo.findOneOrFail = jest.fn(async (args: { where: Row }) => {
    const found = rows.find((r) => Object.entries(args.where).every(([k, v]) => r[k] === v));
    if (!found) throw new Error('not found');
    return found;
  });
  repo.create = jest.fn((x: Row) => ({ ...x }));
  repo.save = jest.fn(async (x: Row | Row[]) => {
    const one = (r: Row) => {
      if (!r.id) r.id = nextId++;
      rows.push(r);
      return r;
    };
    return Array.isArray(x) ? x.map(one) : one(x);
  });
  repo.update = jest.fn(async () => ({ affected: 1 }));
  repo.delete = jest.fn(async () => ({ affected: 1 }));
  repo.remove = jest.fn(async () => ({}));
  // Duplicate lookups go through the query builder. Every chain step returns the builder.
  const qb: Record<string, unknown> = {};
  for (const m of ['select', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'take', 'skip', 'leftJoin']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getMany = jest.fn(async () => opts.dupes ?? []);
  qb.getManyAndCount = jest.fn(async () => [rows, rows.length]);
  repo.createQueryBuilder = jest.fn(() => qb);
  repo.manager = {
    transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(managerFor(repo))),
    getRepository: jest.fn(() => repo),
  };
  return { repo, rows, qb };
}

/** Transaction manager that hands back the same fake repos. */
function managerFor(repo: Record<string, unknown>) {
  return { getRepository: () => repo };
}

const ORG = 7;
const UNIT = 3;

function user(overrides: Partial<User> = {}): User {
  return {
    id: 5,
    organizationId: ORG,
    role: { name: RoleName.ORG_ADMIN },
    ...overrides,
  } as unknown as User;
}

const stages: Row[] = [
  { id: 11, pipelineId: 1, organizationId: ORG, name: 'New', position: 0, probability: 10, isWon: false, isLost: false },
  { id: 12, pipelineId: 1, organizationId: ORG, name: 'Contacted', position: 1, probability: 20, isWon: false, isLost: false },
  { id: 16, pipelineId: 1, organizationId: ORG, name: 'Won', position: 5, probability: 100, isWon: true, isLost: false },
  { id: 17, pipelineId: 1, organizationId: ORG, name: 'Lost', position: 6, probability: 0, isWon: false, isLost: true },
  { id: 21, pipelineId: 2, organizationId: ORG, name: 'Other pipeline stage', position: 0, probability: 10, isWon: false, isLost: false },
];

function build(opts: { leads?: Row[]; dupes?: Row[]; scope?: Record<string, unknown> } = {}) {
  const leadsRepo = fakeRepo(opts.leads ?? [], { dupes: opts.dupes });
  const stagesRepo = fakeRepo(stages);
  const activitiesRepo = fakeRepo([]);
  const tasksRepo = fakeRepo([]);
  const usersRepo = fakeRepo([{ id: 5, organizationId: ORG }]);
  const pipelineRepo = fakeRepo([{ id: 1, organizationId: ORG, businessUnitId: UNIT }]);
  const businessUnits = { resolveUnitId: jest.fn().mockResolvedValue(UNIT) };
  const pipelines = {
    ensureDefault: jest.fn().mockResolvedValue({ id: 1, organizationId: ORG, businessUnitId: UNIT }),
  };
  const customFields = { activeForUnit: jest.fn().mockResolvedValue([]) };
  // Organization-wide access: the default for these tests. Scope rules have their own tests in access/.
  const access = {
    contextFor: jest.fn().mockResolvedValue(
      opts.scope ?? { userId: 1, permissions: new Set<string>(), dataScope: 'org', unitIds: [], teamUserIds: [] },
    ),
  };
  // Automation hooks: owner passes through unchanged, no rules fire. Automation has its own tests.
  const automation = {
    prepareNewLead: jest.fn(async (_orgId: number, _unitId: number, draft: { ownerUserId: number | null }) => ({
      ownerUserId: draft.ownerUserId ?? null,
      firstResponseDueAt: null,
      score: 0,
    })),
    afterLeadCreated: jest.fn(async () => undefined),
    afterStageChanged: jest.fn(async () => undefined),
    afterFieldsChanged: jest.fn(async () => undefined),
    afterActivity: jest.fn(async () => undefined),
  };
  const service = new LeadsService(
    leadsRepo.repo as never,
    stagesRepo.repo as never,
    activitiesRepo.repo as never,
    tasksRepo.repo as never,
    usersRepo.repo as never,
    pipelineRepo.repo as never,
    businessUnits as never,
    pipelines as never,
    customFields as never,
    access as never,
    automation as never,
  );
  return { service, leadsRepo, activitiesRepo, businessUnits };
}

const baseLead = (over: Row = {}): Row => ({
  id: 100,
  organizationId: ORG,
  businessUnitId: UNIT,
  pipelineId: 1,
  stageId: 11,
  name: 'Asha',
  email: 'asha@example.com',
  phone: '919876543210',
  company: null,
  source: null,
  status: 'open',
  value: null,
  ownerUserId: null,
  tags: [],
  customData: {},
  lostReason: null,
  closedAt: null,
  ...over,
});

describe('LeadsService.create', () => {
  it('places a new lead in the first stage of the default pipeline, open', async () => {
    const { service, leadsRepo } = build();
    const lead = await service.create(user(), { name: ' Asha ', email: 'ASHA@Example.com', allowDuplicate: true });
    expect(lead.stageId).toBe(11);
    expect(lead.status).toBe('open');
    expect(lead.name).toBe('Asha');
    expect(lead.email).toBe('asha@example.com');
    expect(leadsRepo.repo.save).toHaveBeenCalled();
  });

  it('blocks a duplicate email or phone in the same unit and returns the matches', async () => {
    const dupe = { id: 99, name: 'Asha K', email: 'asha@example.com', phone: null, status: 'open' };
    const { service } = build({ dupes: [dupe] });
    await expect(service.create(user(), { name: 'Asha', email: 'asha@example.com' })).rejects.toMatchObject({
      response: { duplicates: [dupe] },
    });
    await expect(service.create(user(), { name: 'Asha', email: 'asha@example.com' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates anyway when the caller confirms a duplicate', async () => {
    const { service } = build({ dupes: [{ id: 99 }] });
    await expect(
      service.create(user(), { name: 'Asha', email: 'asha@example.com', allowDuplicate: true }),
    ).resolves.toMatchObject({ name: 'Asha' });
  });

  it('rejects a stage that belongs to another pipeline', async () => {
    const { service } = build();
    await expect(
      service.create(user(), { name: 'Asha', stageId: 21, allowDuplicate: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('LeadsService.move', () => {
  it('moving to a won stage closes the lead and logs the change', async () => {
    const { service, leadsRepo, activitiesRepo } = build({ leads: [baseLead()] });
    const moved = await service.move(user(), 100, { stageId: 16 });
    expect(moved.status).toBe('won');
    expect(moved.closedAt).toBeInstanceOf(Date);
    expect(activitiesRepo.repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stage_change', body: 'Moved from "New" to "Won"' }),
    );
    expect(leadsRepo.repo.save).toHaveBeenCalled();
  });

  it('moving to a lost stage records the reason; moving back to open clears it', async () => {
    const { service } = build({ leads: [baseLead()] });
    const lost = await service.move(user(), 100, { stageId: 17, lostReason: 'Went with a competitor' });
    expect(lost.status).toBe('lost');
    expect(lost.lostReason).toBe('Went with a competitor');

    const reopened = await service.move(user(), 100, { stageId: 12 });
    expect(reopened.status).toBe('open');
    expect(reopened.lostReason).toBeNull();
    expect(reopened.closedAt).toBeNull();
  });

  it('refuses a stage from a different pipeline', async () => {
    const { service } = build({ leads: [baseLead()] });
    await expect(service.move(user(), 100, { stageId: 21 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('LeadsService access', () => {
  it('returns "not found" for a lead in another organization, not "forbidden"', async () => {
    const { service } = build({ leads: [baseLead({ organizationId: 99 })] });
    await expect(service.get(user(), 100)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies client-portal users entirely', async () => {
    const { service } = build({ leads: [baseLead()] });
    const client = user({ role: { name: RoleName.CLIENT } as never });
    await expect(service.get(client, 100)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets master admins read a lead from any organization', async () => {
    const { service } = build({ leads: [baseLead({ organizationId: 99 })] });
    const master = user({ role: { name: RoleName.MASTER_ADMIN } as never, organizationId: null as never });
    await expect(service.get(master, 100)).resolves.toMatchObject({ id: 100 });
  });
});

describe('LeadsService.merge', () => {
  it('refuses to merge leads from different business units', async () => {
    const { service } = build({
      leads: [baseLead({ id: 100 }), baseLead({ id: 101, businessUnitId: 4 })],
    });
    await expect(service.merge(user(), 100, 101)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to merge a lead into itself', async () => {
    const { service } = build({ leads: [baseLead()] });
    await expect(service.merge(user(), 100, 100)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('normalizeTags', () => {
  it('trims, drops blanks and duplicates, and caps the count', () => {
    expect(normalizeTags([' vip ', 'vip', '', 'wedding'])).toEqual(['vip', 'wedding']);
    expect(normalizeTags(Array.from({ length: 80 }, (_, i) => `t${i}`))).toHaveLength(50);
    expect(normalizeTags(null)).toEqual([]);
  });
});

describe('LeadsService.importRows', () => {
  it('creates valid rows and reports bad ones by line (header is line 1)', async () => {
    const { service } = build();
    const result = await service.importRows(user(), {
      businessUnitId: UNIT,
      rows: [
        { name: 'Asha', email: 'asha@example.com' },
        { name: '', email: 'x@example.com' },
        { name: 'Ravi', email: 'not-an-email' },
        { name: 'Meera' },
      ],
    } as never);
    expect(result.created).toBe(1);
    expect(result.duplicates).toEqual([]);
    expect(result.failed.map((f) => f.line)).toEqual([3, 4, 5]);
  });

  it('reports duplicates by line without failing the rest of the file', async () => {
    const { service } = build({ dupes: [baseLead()] });
    const result = await service.importRows(user(), {
      businessUnitId: UNIT,
      rows: [{ name: 'Asha', email: 'asha@example.com' }],
    } as never);
    expect(result.created).toBe(0);
    expect(result.duplicates).toEqual([{ line: 2, reason: 'Matches an existing lead (asha@example.com)' }]);
    expect(result.failed).toEqual([]);
  });
});

describe('LeadsService.addFromIntake', () => {
  it('creates a lead in the unit default stage, tied to the form response', async () => {
    const { service, leadsRepo } = build();
    const result = await service.addFromIntake(
      ORG,
      UNIT,
      { name: 'Meera', email: 'Meera@Example.com', source: 'Form: Contact', message: 'Need GST help', submissionId: 42 },
      null,
    );
    expect(result.duplicateOf).toBeNull();
    expect(result.lead.stageId).toBe(11);
    expect(result.lead.status).toBe('open');
    expect(result.lead.email).toBe('meera@example.com');
    expect(result.lead.formSubmissionId).toBe(42);
    expect(result.lead.businessUnitId).toBe(UNIT);
    expect(leadsRepo.repo.save).toHaveBeenCalled();
  });

  it('adds the message to an existing lead with the same phone instead of creating another', async () => {
    const existing = baseLead({ id: 100, email: null, phone: '919876543210' });
    const { service, leadsRepo } = build({ leads: [existing], dupes: [existing] });
    const result = await service.addFromIntake(
      ORG,
      UNIT,
      { name: 'Asha', phone: '+91 98765 43210', message: 'Call me', submissionId: 7 },
      null,
    );
    expect(result.duplicateOf).not.toBeNull();
    expect(result.lead.id).toBe(100);
    expect(leadsRepo.repo.save).not.toHaveBeenCalled();
  });
});

describe('LeadsService data scope', () => {
  it('"own" users get not-found for a lead owned by someone else', async () => {
    const other = baseLead({ id: 300, ownerUserId: 99 });
    const { service } = build({
      leads: [other],
      scope: { userId: 1, permissions: new Set(['leads.view']), dataScope: 'own', unitIds: [], teamUserIds: [] },
    });
    await expect(service.get({ id: 1, organizationId: ORG, role: { name: 'ORG_EMPLOYEE' } } as never, 300)).rejects.toThrow('Lead not found');
  });

  it('"own" users can open a lead they own', async () => {
    const mine = baseLead({ id: 301, ownerUserId: 1 });
    const { service } = build({
      leads: [mine],
      scope: { userId: 1, permissions: new Set(['leads.view']), dataScope: 'own', unitIds: [], teamUserIds: [] },
    });
    const lead = await service.get({ id: 1, organizationId: ORG, role: { name: 'ORG_EMPLOYEE' } } as never, 301);
    expect(lead.id).toBe(301);
  });
});
