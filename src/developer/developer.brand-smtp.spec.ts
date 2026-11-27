import { ForbiddenException } from '@nestjs/common';
import { DeveloperService } from './developer.service';
import { User } from '../entities/user.entity';

function buildService(overrides: Record<string, any> = {}) {
  const sendMail = jest.fn().mockResolvedValue(true);
  const resolveMailAccount = jest.fn().mockResolvedValue({
    id: 9,
    organizationId: 1,
    businessUnitId: 20,
    fromEmail: 'rice@ssrfm.com',
    fromName: 'SSRFM Rice Mills',
    isActive: true,
  });
  const submissionRepo = {
    create: jest.fn((v) => ({ id: 55, createdAt: new Date(), ...v })),
    save: jest.fn(async (v) => v),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    remove: jest.fn(),
  };
  const service = new DeveloperService(
    {} as any, // apiKeyRepo
    {} as any, // emailLogRepo
    submissionRepo as any,
    {} as any, // webhookRepo
    {} as any, // orgRepo
    { findOne: jest.fn().mockResolvedValue(null) } as any, // templateRepo
    { createQueryBuilder: jest.fn() } as any, // clientRepo
    { findOne: jest.fn().mockResolvedValue({ email: 'admin@ssrfm.com' }) } as any, // userRepo
    { sendMail, resolveMailAccount } as any, // emailService
    { emitWebhook: jest.fn() } as any, // queueService
    { isSuppressed: jest.fn().mockResolvedValue(false) } as any, // complianceService
    {} as any, // botShieldService
    { emitToOrg: jest.fn() } as any, // eventsGateway
    {
      ensureDefault: jest.fn().mockResolvedValue({ id: 10, name: 'Default' }),
      findById: jest.fn().mockResolvedValue({
        id: 20,
        name: 'Rice mills',
        unitName: 'Shamshabad',
      }),
    } as any, // businessUnits
    { addFromIntake: jest.fn().mockResolvedValue({ lead: { id: 901 }, duplicateOf: null }) } as any, // leads
    {} as any, // automation
    {
      contextFor: jest.fn().mockResolvedValue({
        userId: 7,
        permissions: new Set(['inbox.manage', 'leads.create']),
        dataScope: 'units',
        unitIds: [20],
        teamUserIds: [],
        adminPanel: true,
      }),
    } as any, // access
  );
  Object.assign(service as any, overrides);
  return { service, sendMail, resolveMailAccount, submissionRepo };
}

describe('DeveloperService per-brand SMTP & scoped inbox', () => {
  it('sends both staff notification and visitor auto-reply via the API key brand SMTP', async () => {
    const { service, sendMail } = buildService();
    const org = { id: 1, name: 'SSRFM', industrySettings: {} } as any;
    const apiKey = { id: 4, businessUnitId: 20, autoCreateLead: false } as any;

    const res = await service.recordSubmission(
      org,
      apiKey,
      {
        name: 'Ravi',
        email: 'ravi@example.com',
        phone: '9876543210',
        message: 'Need 50 bags of sona masoori',
        formName: 'Bulk Order',
      },
      { origin: 'https://ricemills.ssrfm.com' },
    );

    expect(res.success).toBe(true);
    expect(res.notificationSent).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(2);

    // 1. Staff alert goes to the brand's SMTP email, using the brand's SMTP (unitId = 20)
    const staffCall = sendMail.mock.calls[0];
    expect(staffCall[0]).toBe('rice@ssrfm.com');
    expect(staffCall[1]).toContain('Shamshabad · Rice mills');
    expect(staffCall[8]).toBe(20);

    // 2. Visitor auto-reply goes to the visitor via the brand's SMTP (unitId = 20) with brand name
    const visitorCall = sendMail.mock.calls[1];
    expect(visitorCall[0]).toBe('ravi@example.com');
    expect(visitorCall[1]).toContain('SSRFM Rice Mills');
    expect(visitorCall[3]).toContain('SSRFM Rice Mills');
    expect(visitorCall[8]).toBe(20);
  });

  it('scopes inbox listing and lead conversion to the employee assigned brands', async () => {
    const { service, submissionRepo } = buildService();
    const employee = { id: 7, organizationId: 1 } as User;

    // Listing restricts to unitIds [20]
    await service.listSubmissions(1, undefined, employee);
    expect(submissionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 1 }),
      }),
    );

    // Filtering by an unassigned brand returns empty without hitting DB
    submissionRepo.find.mockClear();
    const empty = await service.listSubmissions(1, undefined, employee, 99);
    expect(empty).toEqual([]);
    expect(submissionRepo.find).not.toHaveBeenCalled();

    // Converting a submission from an unassigned brand is forbidden
    submissionRepo.findOne.mockResolvedValueOnce({
      id: 12,
      organizationId: 1,
      businessUnitId: 99,
      data: {},
    });
    await expect(service.convertSubmissionToLead(1, 12, employee)).rejects.toThrow(
      ForbiddenException,
    );

    // Converting a submission from an assigned brand succeeds
    submissionRepo.findOne.mockResolvedValueOnce({
      id: 13,
      organizationId: 1,
      businessUnitId: 20,
      senderName: 'Ravi',
      senderEmail: 'ravi@example.com',
      data: {},
    });
    const converted = await service.convertSubmissionToLead(1, 13, employee);
    expect(converted).toEqual({ leadId: 901, duplicate: false });
  });
});
