import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MailManagementService } from './mail-management.service';
import { RoleName } from '../common/enums/role.enum';
import { mockRepo, MockRepo, userWith } from '../test-utils';

describe('MailManagementService.createSchedule', () => {
  let schedules: MockRepo, recurring: MockRepo, templates: MockRepo;
  let service: MailManagementService;
  const orgAdmin = userWith(RoleName.ORG_ADMIN); // organizationId 10
  const custom = {
    subject: ' Hi ',
    body: ' Body ',
    recipientEmails: ['a@x.com', 'a@x.com', 'b@x.com'],
  };

  const scheduledAts = () =>
    schedules.save.mock.calls.map((c) =>
      (c[0].scheduledAt as Date).toISOString(),
    );

  beforeEach(() => {
    schedules = mockRepo();
    recurring = mockRepo();
    templates = mockRepo();
    const s3 = { download: jest.fn().mockResolvedValue(Buffer.from("file")) };
    service = new MailManagementService(
      mockRepo() as any,
      mockRepo() as any,
      schedules as any,
      recurring as any,
      templates as any,
      mockRepo() as any,
      mockRepo() as any,
      {} as any,
      { emit: jest.fn() } as any,
      { valuesFor: jest.fn().mockResolvedValue({}) } as any,
      s3 as any,
      { suppressedAmong: jest.fn().mockResolvedValue(new Map()) } as any,
      {} as any,
      mockRepo() as any,
    );
  });

  it('creates one pending email per time slot, converting local time to UTC', async () => {
    const res = await service.createSchedule(
      {
        ...custom,
        schedule: {
          type: 'single_date',
          date: '2026-03-05',
          times: ['09:00', '14:30', ' '],
          timeZoneOffset: '+05:30',
        },
      } as any,
      orgAdmin,
    );

    expect(res.created).toBe(2);
    expect(scheduledAts()).toEqual([
      '2026-03-05T03:30:00.000Z',
      '2026-03-05T09:00:00.000Z',
    ]);
    expect(schedules.save.mock.calls[0][0]).toMatchObject({
      subject: 'Hi',
      body: 'Body',
      status: 'pending',
      organizationId: 10,
      createdBy: 1,
      recipientEmails: ['a@x.com', 'b@x.com'],
    });
  });

  it('treats times as UTC when no offset is given', async () => {
    await service.createSchedule(
      {
        ...custom,
        schedule: { type: 'single_date', date: '2026-03-05', times: ['09:00'] },
      } as any,
      orgAdmin,
    );
    expect(scheduledAts()).toEqual(['2026-03-05T09:00:00.000Z']);
  });

  // Tests run in America/New_York (test/jest-global-setup.js): behind UTC, with a DST switch on 2026-03-08.
  describe('independent of server timezone', () => {
    it('runs in a timezone behind UTC', () => {
      expect(new Date('2026-03-02').getTimezoneOffset()).toBeGreaterThan(0);
    });

    it('includes both ends of a date range across a DST switch', async () => {
      await service.createSchedule(
        {
          ...custom,
          schedule: {
            type: 'date_range',
            fromDate: '2026-03-07',
            toDate: '2026-03-09',
            times: ['10:00'],
          },
        } as any,
        orgAdmin,
      );
      expect(scheduledAts().map((s) => s.slice(0, 10))).toEqual([
        '2026-03-07',
        '2026-03-08',
        '2026-03-09',
      ]);
    });

    it('sends weekly mail only on the chosen weekdays', async () => {
      // 2026-03-02 is a Monday; 2026-03-08 (Sun) is a US DST switch.
      await service.createSchedule(
        {
          ...custom,
          schedule: {
            type: 'weekly',
            fromDate: '2026-03-02',
            toDate: '2026-03-15',
            days: ['mon', 'Thursday'],
            times: ['08:00'],
          },
        } as any,
        orgAdmin,
      );
      expect(scheduledAts().map((s) => s.slice(0, 10))).toEqual([
        '2026-03-02',
        '2026-03-05',
        '2026-03-09',
        '2026-03-12',
      ]);
    });
  });

  it('rejects a schedule that produces no slots', async () => {
    await expect(
      service.createSchedule(
        {
          ...custom,
          schedule: {
            type: 'date_range',
            fromDate: '2026-04-02',
            toDate: '2026-04-01',
            times: ['10:00'],
          },
        } as any,
        orgAdmin,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(schedules.save).not.toHaveBeenCalled();
  });

  it('requires a subject and body for custom emails', async () => {
    await expect(
      service.createSchedule(
        {
          ...custom,
          subject: ' ',
          schedule: {
            type: 'single_date',
            date: '2026-03-05',
            times: ['09:00'],
          },
        } as any,
        orgAdmin,
      ),
    ).rejects.toThrow('subject is required');
  });

  describe('templates', () => {
    const slot = { type: 'single_date', date: '2026-03-05', times: ['09:00'] };

    it("refuses another organization's template and an unknown one", async () => {
      templates.findOne.mockResolvedValueOnce({ id: 3, organizationId: 99 });
      await expect(
        service.createSchedule(
          {
            templateId: 3,
            recipientEmails: ['a@x.com'],
            schedule: slot,
          } as any,
          orgAdmin,
        ),
      ).rejects.toThrow(ForbiddenException);
      templates.findOne.mockResolvedValueOnce(null);
      await expect(
        service.createSchedule(
          {
            templateId: 4,
            recipientEmails: ['a@x.com'],
            schedule: slot,
          } as any,
          orgAdmin,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets master admins use only global templates', async () => {
      const master = userWith(RoleName.MASTER_ADMIN);
      templates.findOne.mockResolvedValueOnce({ id: 3, organizationId: 10 });
      await expect(
        service.createSchedule(
          {
            templateId: 3,
            recipientEmails: ['a@x.com'],
            schedule: slot,
          } as any,
          master,
        ),
      ).rejects.toThrow(ForbiddenException);
      templates.findOne.mockResolvedValueOnce({ id: 5, organizationId: null });
      await expect(
        service.createSchedule(
          {
            templateId: 5,
            recipientEmails: ['a@x.com'],
            schedule: slot,
          } as any,
          master,
        ),
      ).resolves.toMatchObject({
        created: 1,
      });
      expect(schedules.save.mock.calls[0][0]).toMatchObject({
        templateId: 5,
        subject: null,
        body: null,
        organizationId: null,
      });
    });
  });

  describe('monthly', () => {
    const monthly = (extra: object) => ({
      ...custom,
      schedule: {
        type: 'monthly',
        monthlyMonths: [1, 6],
        monthlyDays: [1, 15],
        times: ['09:00'],
        ...extra,
      },
    });

    it('creates one recurring schedule', async () => {
      await expect(
        service.createSchedule(monthly({}) as any, orgAdmin),
      ).resolves.toMatchObject({ created: 1, type: 'recurring' });
      expect(recurring.save).toHaveBeenCalledWith(
        expect.objectContaining({
          months: [1, 6],
          days: [1, 15],
          status: 'active',
          organizationId: 10,
        }),
      );
    });

    it.each([
      ['month', { monthlyMonths: [] }],
      ['day', { monthlyDays: [] }],
      ['send time', { times: [' '] }],
    ])('requires at least one %s', async (_, extra) => {
      await expect(
        service.createSchedule(monthly(extra) as any, orgAdmin),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
