import { BadRequestException } from '@nestjs/common';
import { MailManagementService } from './mail-management.service';
import { RoleName } from '../common/enums/role.enum';
import { mockRepo, MockRepo, userWith } from '../test-utils';

describe('MailManagementService bulk send', () => {
  let schedules: MockRepo, recurring: MockRepo, orgs: MockRepo, users: MockRepo;
  let mailer: { sendCustomInternal: jest.Mock; sendWithTemplateInternal: jest.Mock };
  let service: MailManagementService;
  let s3: { download: jest.Mock };
  let compliance: { suppressedAmong: jest.Mock };
  let segments: { resolve: jest.Mock };
  let deliveries: MockRepo;
  const orgAdmin = userWith(RoleName.ORG_ADMIN); // organizationId 10

  beforeEach(() => {
    schedules = mockRepo();
    recurring = mockRepo();
    orgs = mockRepo();
    users = mockRepo();
    recurring.find.mockResolvedValue([]);
    orgs.findOne.mockResolvedValue({ id: 10, name: 'Firm' });
    const qb: any = {};
    for (const m of ['innerJoin', 'where', 'andWhere', 'select']) qb[m] = jest.fn(() => qb);
    qb.getOne = jest.fn().mockResolvedValue({ id: 1, name: 'Admin', email: 'admin@firm.com' });
    users.createQueryBuilder.mockReturnValue(qb);
    mailer = {
      sendCustomInternal: jest.fn().mockResolvedValue(true),
      sendWithTemplateInternal: jest.fn().mockResolvedValue(true),
    };
    segments = { resolve: jest.fn().mockResolvedValue([]) };
    deliveries = mockRepo();
    compliance = { suppressedAmong: jest.fn().mockResolvedValue(new Map()) };
    s3 = { download: jest.fn(async (key: string) => Buffer.from(key)) };
    service = new MailManagementService(
      mockRepo() as any,
      mockRepo() as any,
      schedules as any,
      recurring as any,
      mockRepo() as any,
      orgs as any,
      users as any,
      mailer as any,
      { emitToOrg: jest.fn() } as any,
      { valuesFor: jest.fn().mockResolvedValue({}), valuesForClients: jest.fn().mockResolvedValue(new Map([[5, { plan: 'Gold' }]])) } as any,
      s3 as any,
      compliance as any,
      segments as any,
      deliveries as any,
    );
    service.pause = jest.fn().mockResolvedValue(undefined); // no 2s waits in tests
  });

  describe('queueBulkSend', () => {
    it('queues one pending row with each recipient’s own variables, de-duplicated', async () => {
      const res = await service.queueBulkSend(
        {
          subject: ' Hi {{client_name}} ',
          body: ' Body ',
          recipients: [
            { email: 'Asha@x.com', variables: { client_name: 'Asha' } },
            { email: 'asha@x.com', variables: { client_name: 'Dup' } },
            { email: 'ravi@x.com', variables: { client_name: 'Ravi' } },
          ],
          cc: ' boss@firm.com ',
        },
        orgAdmin,
      );

      expect(res.queued).toBe(2);
      expect(schedules.save.mock.calls[0][0]).toMatchObject({
        subject: 'Hi {{client_name}}',
        body: 'Body',
        status: 'pending',
        progress: 0,
        organizationId: 10,
        cc: 'boss@firm.com',
        bcc: null,
        recipientEmails: ['asha@x.com', 'ravi@x.com'],
        recipientVariables: {
          'asha@x.com': { client_name: 'Asha' },
          'ravi@x.com': { client_name: 'Ravi' },
        },
      });
      expect(
        Math.abs((schedules.save.mock.calls[0][0].scheduledAt as Date).getTime() - Date.now()),
      ).toBeLessThan(5000);
    });

    it('requires a subject and body for custom messages', async () => {
      await expect(
        service.queueBulkSend({ body: 'x', recipients: [{ email: 'a@x.com' }] } as any, orgAdmin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(schedules.save).not.toHaveBeenCalled();
    });
  });

  describe('createSchedule with per-recipient variables', () => {
    const recipients = [
      { email: 'A@x.com', variables: { client_name: 'A' } },
      { email: 'b@x.com', variables: { client_name: 'B' } },
    ];

    it('dated schedule: one call, one row per slot holding every recipient’s own variables', async () => {
      schedules.save.mockImplementation(async (r: any) => ({ id: 1, ...r }));
      const res = await service.createSchedule(
        { subject: 'Hi {{client_name}}', body: 'x', recipients, variables: { amount: '5' },
          schedule: { type: 'single_date', date: '2099-01-01', times: ['10:00'] } } as any,
        orgAdmin,
      );
      expect(res.created).toBe(1);
      expect(schedules.save.mock.calls[0][0]).toMatchObject({
        recipientEmails: ['a@x.com', 'b@x.com'],
        recipientVariables: { 'a@x.com': { client_name: 'A' }, 'b@x.com': { client_name: 'B' } },
        variables: { amount: '5' },
      });
    });

    it('monthly: one call saves one recurring row per recipient with merged variables', async () => {
      recurring.save.mockImplementation(async (rows: any[]) => rows.map((r, i) => ({ id: i + 1, ...r })));
      const res = await service.createSchedule(
        { subject: 'Hi', body: 'x', recipients, variables: { amount: '5' },
          schedule: { type: 'monthly', monthlyMonths: [1], monthlyDays: [1], times: ['10:00'] } } as any,
        orgAdmin,
      );
      expect(res.created).toBe(2);
      expect(recurring.save).toHaveBeenCalledTimes(1);
      expect(recurring.save.mock.calls[0][0].map((r: any) => [r.recipientEmails, r.variables])).toEqual([
        [['a@x.com'], { amount: '5', client_name: 'A' }],
        [['b@x.com'], { amount: '5', client_name: 'B' }],
      ]);
    });
  });

  describe('repeat', () => {
    const recipients = [
      { email: 'a@x.com', variables: { client_name: 'A' } },
      { email: 'b@x.com', variables: { client_name: 'B' } },
    ];
    const rule = { every: 'month', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], days: [20], startDate: '2026-11-01', count: 2 };

    it('saves one row carrying per-recipient values, Cc and files', async () => {
      recurring.save.mockImplementation(async (r: any) => ({ id: 7, ...r }));
      const res = await service.createSchedule(
        { subject: 'Hi', body: 'x', recipients, cc: ' boss@firm.com ', attachments: [{ key: 'mail-attachments/10/a.pdf', name: 'a.pdf', size: 5 }],
          schedule: { type: 'repeat', repeat: rule, times: ['10:00'], timeZoneOffset: '+05:30' } } as any,
        orgAdmin,
      );
      expect(res).toEqual({ created: 1, type: 'recurring', id: 7 });
      expect(recurring.save.mock.calls[0][0]).toMatchObject({
        frequency: 'month', days: [20], weekdays: null, maxSends: 2, cc: 'boss@firm.com',
        recipientVariables: { 'a@x.com': { client_name: 'A' }, 'b@x.com': { client_name: 'B' } },
        attachments: [{ name: 'a.pdf' }],
      });
    });

    it('refuses weekly without weekdays', async () => {
      await expect(service.createSchedule(
        { subject: 'Hi', body: 'x', recipients, schedule: { type: 'repeat', repeat: { ...rule, every: 'week', weekdays: [] }, times: ['10:00'] } } as any,
        orgAdmin,
      )).rejects.toBeInstanceOf(BadRequestException);
    });

    it('spawns a send with everything copied, and ends after the last allowed send', async () => {
      const row: any = { id: 7, status: 'active', months: rule.months, days: [20], weekdays: null, times: ['10:00'], timeZoneOffset: '+05:30',
        recipientEmails: ['a@x.com'], recipientVariables: { 'a@x.com': { client_name: 'A' } }, cc: 'boss@firm.com',
        segment: { rules: [], resolvedAt: 'x', matched: 3 }, batchId: 'b', maxSends: 2, sentCount: 1, startDate: '2026-11-01', endDate: null };
      recurring.find.mockResolvedValue([row]);
      const qb: any = {};
      for (const m of ['where', 'andWhere']) qb[m] = jest.fn(() => qb);
      qb.getOne = jest.fn().mockResolvedValue(null);
      schedules.createQueryBuilder.mockReturnValue(qb);
      await (service as any).insertRecurringDueSlots(new Date('2026-11-20T04:31:00Z')); // 10:01 IST
      expect(schedules.save.mock.calls[0][0]).toMatchObject({
        recipientVariables: { 'a@x.com': { client_name: 'A' } }, cc: 'boss@firm.com', batchId: 'b',
        segment: { rules: [], resolvedAt: undefined, matched: undefined },
      });
      expect(row).toMatchObject({ sentCount: 2, status: 'ended' });
    });
  });

  describe('processDueSchedules', () => {
    const bulkRow = (extra: Record<string, unknown> = {}) => ({
      id: 7,
      templateId: null,
      subject: 'Hi {{client_name}}',
      body: 'Body',
      recipientEmails: ['a@x.com', 'b@x.com'],
      recipientVariables: { 'a@x.com': { client_name: 'A' }, 'b@x.com': { client_name: 'B' } },
      variables: null,
      cc: 'boss@firm.com',
      bcc: null,
      progress: 0,
      status: 'pending',
      organizationId: 10,
      createdBy: 1,
      ...extra,
    });

    it('sends each recipient their own variables plus org variables, with CC', async () => {
      schedules.find.mockResolvedValue([bulkRow()]);
      const res = await service.processDueSchedules();

      expect(res.sent).toBe(2);
      const calls = mailer.sendCustomInternal.mock.calls;
      expect(calls.map((c) => [c[0], c[3].client_name, c[3].org_name, c[6]])).toEqual([
        ['a@x.com', 'A', 'Firm', 'boss@firm.com'],
        ['b@x.com', 'B', 'Firm', 'boss@firm.com'],
      ]);
      const last = schedules.save.mock.calls.at(-1)![0];
      expect(last).toMatchObject({ status: 'sent', progress: 2 });
    });

    it('skips unsubscribed and bounced addresses and notes how many', async () => {
      compliance.suppressedAmong.mockResolvedValue(new Map([['a@x.com', 'unsubscribed']]));
      schedules.find.mockResolvedValue([bulkRow()]);
      await service.processDueSchedules();
      expect(compliance.suppressedAmong).toHaveBeenCalledWith(10, ['a@x.com', 'b@x.com']);
      expect(mailer.sendCustomInternal.mock.calls.map((c) => c[0])).toEqual(['b@x.com']);
      expect(schedules.save.mock.calls.at(-1)![0]).toMatchObject({
        status: 'sent', progress: 2, errorMessage: 'Skipped 1 unsubscribed or bounced address',
      });
    });

    it('resumes an interrupted send from its saved progress instead of starting over', async () => {
      schedules.find.mockResolvedValue([bulkRow({ status: 'sending', progress: 1 })]);
      await service.processDueSchedules();
      expect(mailer.sendCustomInternal.mock.calls.map((c) => c[0])).toEqual(['b@x.com']);
    });

    it('fills {{login_password}} per recipient from their portal login, only when used', async () => {
      service.loginVariables = jest.fn(async (_org, to: string) => ({ login_email: `login-${to}`, login_password: 'pw' }));
      schedules.find.mockResolvedValue([bulkRow({ body: 'Pwd {{ login_password }}' })]);
      await service.processDueSchedules();
      expect(mailer.sendCustomInternal.mock.calls.map((c) => [c[0], c[3].login_password, c[3].client_name])).toEqual([
        ['a@x.com', 'pw', 'A'],
        ['b@x.com', 'pw', 'B'],
      ]);

      (service.loginVariables as jest.Mock).mockClear();
      schedules.find.mockResolvedValue([bulkRow()]);
      await service.processDueSchedules();
      expect(service.loginVariables).not.toHaveBeenCalled();
    });

    it('fills org custom variables per recipient; a typed value wins, an empty one does not blank it', async () => {
      const valuesFor = (service as any).customVariables.valuesFor as jest.Mock;
      valuesFor.mockImplementation(async (_org, to: string) => ({ meeting_link: `link-${to}` }));
      schedules.find.mockResolvedValue([
        bulkRow({
          body: 'Join {{meeting_link}}',
          recipientVariables: { 'a@x.com': { client_name: 'A', meeting_link: 'typed' }, 'b@x.com': { client_name: 'B', meeting_link: '' } },
        }),
      ]);
      await service.processDueSchedules();
      expect(valuesFor).toHaveBeenCalledWith(10, 'a@x.com');
      expect(mailer.sendCustomInternal.mock.calls.map((c) => [c[0], c[3].meeting_link])).toEqual([
        ['a@x.com', 'typed'],
        ['b@x.com', 'link-b@x.com'],
      ]);

      valuesFor.mockClear();
      schedules.find.mockResolvedValue([bulkRow()]); // only built-in variables -> no lookup
      await service.processDueSchedules();
      expect(valuesFor).not.toHaveBeenCalled();
    });

    it('a group send adds who matches when it goes out, keeping explicit recipients and their values', async () => {
      segments.resolve.mockResolvedValue([
        { id: 5, name: 'Asha', email: ' Asha@X.com ', companyName: 'Asha Co', services: [], directors: [] },
        { id: 6, name: 'Dup', email: 'b@x.com', services: [], directors: [] },
      ]);
      const segment = { rules: [{ field: 'tags', op: 'any', values: ['vip'] }], excludeIds: [9], tzOffsetMinutes: 330, fallbacks: { client_name: 'there', note: 'Hi' }, label: 'VIP' };
      schedules.find.mockResolvedValue([bulkRow({ recipientEmails: ['b@x.com'], recipientVariables: { 'b@x.com': { client_name: 'B' } }, segment })]);
      await service.processDueSchedules();
      expect(segments.resolve).toHaveBeenCalledWith(10, segment.rules, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), [9]);
      const calls = mailer.sendCustomInternal.mock.calls;
      expect(calls.map((c) => [c[0], c[3].client_name, c[3].company_name, c[3].plan, c[3].note])).toEqual([
        ['b@x.com', 'B', undefined, undefined, undefined],
        ['asha@x.com', 'Asha', 'Asha Co', 'Gold', 'Hi'],
      ]);
      expect(schedules.save.mock.calls.at(-1)![0].segment).toMatchObject({ matched: 2, resolvedAt: expect.any(String) });
    });

    it('a group that matches nobody fails with a reason instead of sending', async () => {
      schedules.find.mockResolvedValue([bulkRow({ recipientEmails: [], recipientVariables: {}, segment: { rules: [], excludeIds: [], tzOffsetMinutes: 0, fallbacks: {}, label: null } })]);
      await service.processDueSchedules();
      expect(mailer.sendCustomInternal).not.toHaveBeenCalled();
      expect(schedules.save.mock.calls.at(-1)![0]).toMatchObject({ status: 'failed', errorMessage: expect.stringMatching(/No contacts/) });
    });

    it('a repeat’s daily group send that matches nobody is dropped quietly (not a failure)', async () => {
      const row = bulkRow({ recipientEmails: [], recipientVariables: {}, recurringScheduleId: 3,
        segment: { rules: [{ field: 'followUp', op: 'on', days: 3 }], excludeIds: [], tzOffsetMinutes: 330, fallbacks: {}, label: null } });
      schedules.find.mockResolvedValue([row]);
      const res = await service.processDueSchedules();
      expect(mailer.sendCustomInternal).not.toHaveBeenCalled();
      expect(schedules.remove).toHaveBeenCalledWith(row);
      expect(res.failed).toBe(0);
    });

    it('refuses a monthly schedule to a group', async () => {
      await expect(service.createSchedule({ subject: 's', body: 'b', segment: { rules: [], tzOffsetMinutes: 0 },
        schedule: { type: 'monthly', dayOfMonth: 1, times: ['10:00'] } } as any, orgAdmin)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('stops when the user cancels mid-send', async () => {
      const emails = Array.from({ length: 25 }, (_, i) => `u${i}@x.com`);
      schedules.find.mockResolvedValue([bulkRow({ recipientEmails: emails, recipientVariables: {} })]);
      schedules.findOne.mockResolvedValue({ id: 7, status: 'cancelled' });

      await service.processDueSchedules();

      expect(mailer.sendCustomInternal).toHaveBeenCalledTimes(10);
      expect(schedules.save.mock.calls.at(-1)![0]).toMatchObject({ status: 'cancelled', progress: 10 });
    });
  });
  describe('delivery records', () => {
    const row = { id: 7, templateId: null, subject: 'Hi', body: 'Body', recipientEmails: ['a@x.com', 'b@x.com', 'c@x.com'],
      recipientVariables: { 'a@x.com': { client_name: 'A' }, 'c@x.com': { client_name: 'C' } }, recipientAttachments: null,
      variables: null, cc: 'boss@firm.com', bcc: null, progress: 0, status: 'pending', organizationId: 10, createdBy: 1, batchId: 'b-1' };

    it('notes sent, skipped and failed for each recipient', async () => {
      compliance.suppressedAmong.mockResolvedValue(new Map([['b@x.com', 'unsubscribed']]));
      mailer.sendCustomInternal.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('550 mailbox full'));
      schedules.find.mockResolvedValue([{ ...row }]);
      await service.processDueSchedules();
      expect(deliveries.upsert.mock.calls.map((c) => [c[0].email, c[0].status, c[0].reason])).toEqual([
        ['a@x.com', 'sent', null],
        ['b@x.com', 'skipped', 'unsubscribed'],
        ['c@x.com', 'failed', '550 mailbox full'],
      ]);
      expect(deliveries.upsert.mock.calls[0][1]).toEqual(['scheduleId', 'email']);
    });

    it('resend queues only the failed recipients, with their values, in the same batch and without Cc', async () => {
      schedules.findOne.mockResolvedValue({ ...row, status: 'sent' });
      deliveries.find.mockResolvedValue([{ email: 'c@x.com', status: 'failed' }]);
      schedules.save.mockImplementation(async (r: any) => ({ id: 99, ...r }));
      expect(await service.resendFailed(7, orgAdmin)).toEqual({ id: 99, queued: 1 });
      expect(deliveries.find).toHaveBeenCalledWith({ where: { scheduleId: 7, status: 'failed' } });
      expect(schedules.save.mock.calls[0][0]).toMatchObject({
        recipientEmails: ['c@x.com'], recipientVariables: { 'c@x.com': { client_name: 'C' } }, batchId: 'b-1', status: 'pending',
      });
      expect(schedules.save.mock.calls[0][0].cc).toBeUndefined();
    });

    it('resend with nobody failed is refused', async () => {
      schedules.findOne.mockResolvedValue({ ...row, status: 'sent' });
      deliveries.find.mockResolvedValue([]);
      await expect(service.resendFailed(7, orgAdmin)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('all time slots of one schedule share a batch', async () => {
      schedules.save.mockImplementation(async (r: any) => r);
      await service.createSchedule({ subject: 's', body: 'b', recipients: [{ email: 'a@x.com' }],
        schedule: { type: 'multiple_dates', dates: ['2099-01-01', '2099-02-01'], times: ['10:00'] } } as any, orgAdmin);
      const ids = schedules.save.mock.calls.map((c) => c[0].batchId);
      expect(ids).toHaveLength(2);
      expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
      expect(ids[1]).toBe(ids[0]);
    });
  });

  describe('cancelSchedule', () => {
    it('cancels a pending email but removes a failed one from the list', async () => {
      schedules.findOne.mockResolvedValueOnce({ id: 1, status: 'pending', organizationId: 10 });
      schedules.save.mockImplementation(async (r: any) => r);
      expect(await service.cancelSchedule(1, orgAdmin)).toMatchObject({ status: 'cancelled' });
      schedules.findOne.mockResolvedValueOnce({ id: 2, status: 'failed', organizationId: 10 });
      expect(await service.cancelSchedule(2, orgAdmin)).toEqual({ deleted: true });
      expect(schedules.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
      schedules.findOne.mockResolvedValueOnce({ id: 3, status: 'sent', organizationId: 10 });
      await expect(service.cancelSchedule(3, orgAdmin)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('attachments', () => {
    const file = (key: string, size = 1000) => ({ key: `mail-attachments/10/u1/${key}`, name: key, size, contentType: 'application/pdf' });

    it('queues shared and per-recipient files', async () => {
      await service.queueBulkSend({
        subject: 'S', body: 'B', attachments: [file('circular.pdf')],
        recipients: [{ email: 'A@x.com', attachments: [file('inv-a.pdf')] }, { email: 'b@x.com' }],
      } as any, orgAdmin);
      expect(schedules.save.mock.calls[0][0]).toMatchObject({
        attachments: [{ name: 'circular.pdf' }],
        recipientAttachments: { 'a@x.com': [{ name: 'inv-a.pdf' }] },
      });
    });

    it('rejects files from another organization and emails over 20 MB', async () => {
      const foreign = { ...file('x.pdf'), key: 'mail-attachments/99/u1/x.pdf' };
      await expect(service.queueBulkSend({ subject: 'S', body: 'B', attachments: [foreign], recipients: [{ email: 'a@x.com' }] } as any, orgAdmin))
        .rejects.toBeInstanceOf(BadRequestException);
      const big = [file('1.pdf', 9e6), file('2.pdf', 9e6)];
      await expect(service.queueBulkSend({ subject: 'S', body: 'B', attachments: big, recipients: [{ email: 'a@x.com', attachments: [file('3.pdf', 5e6)] }] } as any, orgAdmin))
        .rejects.toThrow('20 MB');
      expect(schedules.save).not.toHaveBeenCalled();
    });

    it('sends each recipient the shared files plus their own, downloading shared ones once', async () => {
      schedules.find.mockResolvedValue([{
        id: 7, templateId: null, subject: 'S', body: 'B', recipientEmails: ['a@x.com', 'b@x.com'],
        recipientVariables: {}, variables: null, cc: null, bcc: null, progress: 0, status: 'pending', organizationId: 10, createdBy: 1,
        attachments: [file('circular.pdf')], recipientAttachments: { 'a@x.com': [file('inv-a.pdf')] },
      }]);
      await service.processDueSchedules();
      const names = mailer.sendCustomInternal.mock.calls.map((c) => [c[0], (c[8] as { filename: string }[]).map((x) => x.filename)]);
      expect(names).toEqual([['a@x.com', ['circular.pdf', 'inv-a.pdf']], ['b@x.com', ['circular.pdf']]]);
      expect(s3.download.mock.calls.filter((c) => c[0].endsWith('circular.pdf'))).toHaveLength(1);
    });
  });
});
