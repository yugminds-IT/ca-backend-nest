import { BadRequestException } from '@nestjs/common';
import { LeadActionsService } from './lead-actions.service';
import { SequenceRunnerService } from './sequence-runner.service';
import { CRM_MAIL_SENDER } from './automation.tokens';

const ORG = 7;

type Row = Record<string, any>;

/** Repository fake: `find` returns the preset rows, `update` and `save` are recorded. */
function repo(rows: Row[] = []): any {
  return {
    rows,
    find: jest.fn(async () => rows),
    findOne: jest.fn(async ({ where }: { where: Row }) => rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null),
    update: jest.fn(async () => ({ affected: 1 })),
    save: jest.fn(async (x: Row) => ({ id: 1, ...x })),
    create: jest.fn((x: Row) => ({ ...x })),
    count: jest.fn(async () => 0),
  };
}

function lead(over: Row = {}): Row {
  return {
    id: 100,
    organizationId: ORG,
    businessUnitId: 3,
    name: 'Asha Rao',
    email: 'asha@example.com',
    phone: null,
    company: 'Lumen',
    source: 'Website',
    status: 'open',
    ownerUserId: 5,
    tags: [],
    customData: {},
    ...over,
  };
}

function buildActions(sender: any) {
  const leads = repo([lead()]);
  const activities = repo();
  const tasks = repo();
  const users = repo([{ id: 5, organizationId: ORG, isActive: true, role: { name: 'ORG_EMPLOYEE' } }]);
  const events = { emitToOrg: jest.fn() };
  const moduleRef = { get: jest.fn((token: unknown) => (token === CRM_MAIL_SENDER ? sender : undefined)) };
  const service = new LeadActionsService(
    leads as never,
    activities as never,
    tasks as never,
    users as never,
    events as never,
    moduleRef as never,
  );
  return { service, leads, activities, tasks, events, moduleRef };
}

describe('LeadActionsService.run', () => {
  it('keeps going after a failing action and reports each outcome', async () => {
    const sender: any = { sendTransactional: jest.fn() };
    const { service, leads, tasks } = buildActions(sender);
    const target = lead();

    const result = await service.run(
      target as never,
      [
        { type: 'assign', userId: 999 },
        { type: 'add_tag', tag: 'Dubai' },
        { type: 'create_task', title: 'Call {{first_name}}', dueInDays: 1 },
      ],
      null,
    );

    expect(result.ok).toBe(false);
    expect(result.log[0]).toMatch(/^Action 1 failed: User #999 is not active staff/);
    expect(result.log[1]).toBe('Added tag "dubai"');
    expect(result.log[2]).toBe('Created task "Call Asha"');
    expect(target.tags).toEqual(['dubai']);
    expect(leads.update).toHaveBeenCalledWith({ id: 100 }, { tags: ['dubai'] });
    expect(tasks.save).toHaveBeenCalledTimes(1);
    expect(tasks.save.mock.calls[0][0]).toMatchObject({ leadId: 100, title: 'Call Asha', assignedToUserId: 5 });
  });

  it('reports ok when every action succeeds', async () => {
    const { service } = buildActions({ sendTransactional: jest.fn() });
    const result = await service.run(lead() as never, [{ type: 'add_tag', tag: 'vip' }], null);
    expect(result).toEqual({ ok: true, log: ['Added tag "vip"'] });
  });

  it('rejects an unknown action type instead of guessing', async () => {
    const { service } = buildActions({ sendTransactional: jest.fn() });
    const result = await service.run(lead() as never, [{ type: 'delete_lead' }], null);
    expect(result.ok).toBe(false);
    expect(result.log[0]).toContain('Unknown action "delete_lead"');
  });
});

describe('LeadActionsService.emailLead', () => {
  it('sends through the tracked path with the lead linked out of band', async () => {
    const sender: any = {
      sendTransactional: jest.fn(async () => ({ id: 'msg_1', status: 'queued' })),
    };
    const { service } = buildActions(sender);

    const result = await service.emailLead(lead() as never, { subject: 'Hi {{first_name}}', body: 'Line <1>' }, {});

    expect(result).toEqual({ id: 'msg_1', status: 'queued', subject: 'Hi Asha' });
    const [orgId, apiKeyId, dto, unitId, crm] = sender.sendTransactional.mock.calls[0];
    expect(orgId).toBe(ORG);
    expect(apiKeyId).toBeNull();
    expect(dto.to).toBe('asha@example.com');
    expect(dto.html).toBe('Line &lt;1&gt;');
    expect(unitId).toBe(3);
    expect(crm).toEqual({ leadId: 100 });
  });

  it('refuses a lead with no email address', async () => {
    const sender: any = { sendTransactional: jest.fn() };
    const { service } = buildActions(sender);
    await expect(service.emailLead(lead({ email: null }) as never, { subject: 'x', body: 'y' }, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(sender.sendTransactional).not.toHaveBeenCalled();
  });

  it('uses the template subject when a template is chosen', async () => {
    const sender: any = { sendTransactional: jest.fn(async () => ({ id: 'msg_2', status: 'queued' })) };
    const { service } = buildActions(sender);
    await service.emailLead(lead() as never, { templateId: 4 }, { sequenceId: 9 });
    const [, , dto, , crm] = sender.sendTransactional.mock.calls[0];
    expect(dto.templateId).toBe(4);
    expect(crm).toEqual({ leadId: 100, sequenceId: 9 });
  });
});

describe('SequenceRunnerService', () => {
  const now = new Date('2026-03-01T09:00:00Z');

  function build(opts: { enrollments: Row[]; sequences: Row[]; leads: Row[]; sender?: any }) {
    const enrollments = repo(opts.enrollments);
    const sequences = repo(opts.sequences);
    const leads = repo(opts.leads);
    const tasks = repo();
    const sender: any = opts.sender ?? { sendTransactional: jest.fn(async () => ({ id: 'msg', status: 'queued' })) };
    const moduleRef = { get: jest.fn(() => sender) };
    const actions = new LeadActionsService(
      leads as never,
      repo() as never,
      tasks as never,
      repo() as never,
      { emitToOrg: jest.fn() } as never,
      moduleRef as never,
    );
    const runner = new SequenceRunnerService(
      sequences as never,
      enrollments as never,
      leads as never,
      tasks as never,
      actions,
    );
    return { runner, enrollments, tasks, sender };
  }

  const twoStep = {
    id: 1,
    name: 'Nurture',
    enabled: true,
    stopOnStageChange: true,
    stopOnReply: true,
    steps: [
      { delayDays: 0, kind: 'email', subject: 'Hello {{first_name}}', body: 'Hi' },
      { delayDays: 3, kind: 'task', taskTitle: 'Call {{first_name}}' },
    ],
  };

  it('sends the current step, then schedules the next one by its delay', async () => {
    const { runner, enrollments, sender } = build({
      enrollments: [{ id: 50, sequenceId: 1, leadId: 100, currentStep: 0, status: 'active', nextStepAt: now }],
      sequences: [twoStep],
      leads: [lead()],
    });

    const result = await runner.processDue(now);

    expect(result).toEqual({ processed: 1, sent: 1, stopped: 0 });
    expect(sender.sendTransactional).toHaveBeenCalledTimes(1);
    const update = enrollments.update.mock.calls[0][1];
    expect(update.currentStep).toBe(1);
    expect(update.nextStepAt.toISOString()).toBe('2026-03-04T09:00:00.000Z');
  });

  it('completes the enrollment after the last step', async () => {
    const { runner, enrollments, tasks } = build({
      enrollments: [{ id: 51, sequenceId: 1, leadId: 100, currentStep: 1, status: 'active', nextStepAt: now }],
      sequences: [twoStep],
      leads: [lead()],
    });

    await runner.processDue(now);

    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Call Asha (Nurture)', leadId: 100 }));
    expect(enrollments.update).toHaveBeenCalledWith({ id: 51 }, { currentStep: 2, status: 'completed', nextStepAt: null });
  });

  it('stops an enrollment when the recipient is suppressed', async () => {
    const sender: any = { sendTransactional: jest.fn(async () => ({ id: 'msg', status: 'suppressed' })) };
    const { runner, enrollments } = build({
      enrollments: [{ id: 52, sequenceId: 1, leadId: 100, currentStep: 0, status: 'active', nextStepAt: now }],
      sequences: [twoStep],
      leads: [lead()],
      sender,
    });

    const result = await runner.processDue(now);

    expect(result.stopped).toBe(1);
    expect(enrollments.update).toHaveBeenCalledWith({ id: 52, status: 'active' }, expect.objectContaining({ status: 'stopped', stopReason: 'suppressed' }));
  });

  it('stops when the lead has been won or lost', async () => {
    const { runner, enrollments, tasks } = build({
      enrollments: [{ id: 53, sequenceId: 1, leadId: 100, currentStep: 0, status: 'active', nextStepAt: now }],
      sequences: [twoStep],
      leads: [lead({ status: 'won' })],
    });
    await runner.processDue(now);
    expect(tasks.save).not.toHaveBeenCalled();
    expect(enrollments.update).toHaveBeenCalledWith({ id: 53, status: 'active' }, expect.objectContaining({ stopReason: 'lead_closed' }));
  });

  it('only stops sequences that turn on the matching setting', async () => {
    const onStage = { ...twoStep, id: 1, stopOnStageChange: true };
    const offStage = { ...twoStep, id: 2, stopOnStageChange: false };
    const { runner, enrollments } = build({
      enrollments: [
        { id: 60, sequenceId: 1, leadId: 100, status: 'active' },
        { id: 61, sequenceId: 2, leadId: 100, status: 'active' },
      ],
      sequences: [onStage, offStage],
      leads: [lead()],
    });

    const stopped = await runner.stopForLead(100, 'stage_changed', 'stopOnStageChange');

    expect(stopped).toBe(1);
    expect(enrollments.update).toHaveBeenCalledWith(
      { id: expect.anything() },
      expect.objectContaining({ status: 'stopped', stopReason: 'stage_changed' }),
    );
  });
});
