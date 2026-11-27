import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FormsService, slugify } from './forms.service';
import { FormField } from './form-rules';

type Row = Record<string, any>;

function repo(rows: Row[] = []) {
  return {
    rows,
    findOne: jest.fn(async ({ where }: { where: Row }) =>
      rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
    ),
    find: jest.fn(async () => rows),
    save: jest.fn(async (x: Row) => x),
    create: jest.fn((x: Row) => x),
  };
}

const fields: FormField[] = [
  { key: 'full_name', label: 'Name', type: 'text', required: true, role: 'name' },
  { key: 'mail', label: 'Email', type: 'email', required: true },
  { key: 'service', label: 'Service', type: 'select', required: false, options: ['GST', 'ITR'] },
];

function build() {
  const forms = repo([
    { id: 5, organizationId: 1, businessUnitId: 2, apiKeyId: 9, name: 'Contact', slug: 'contact-abc123', fields, submitLabel: 'Send', successMessage: 'Thanks', status: 'active' },
    { id: 6, organizationId: 1, businessUnitId: 2, apiKeyId: 10, name: 'Old', slug: 'old', fields: [], submitLabel: 'Send', successMessage: '', status: 'archived' },
  ]);
  const apiKeys = repo([
    { id: 9, isActive: true, organization: { id: 1, name: 'Tavaro' } },
  ]);
  const orgs = repo([{ id: 1, name: 'Tavaro' }]);
  const developer = {
    verifyBotChecks: jest.fn(async () => undefined),
    recordSubmission: jest.fn(async () => ({ success: true, submissionId: 77 })),
  };
  const businessUnits = { resolveUnitId: jest.fn(async () => 2) };
  const service = new FormsService(
    forms as never,
    apiKeys as never,
    orgs as never,
    businessUnits as never,
    developer as never,
    { brandLimitFor: jest.fn(async () => null), assertBrand: jest.fn(async () => undefined) } as never,
  );
  return { service, developer, forms };
}

describe('FormsService.submit', () => {
  const meta = { ip: '1.2.3.4', origin: 'https://tavaro.example' };

  it('silently accepts honeypot submissions without storing anything', async () => {
    const { service, developer } = build();
    const res = await service.submit('contact-abc123', { _honey: 'x' }, meta);
    expect(res.success).toBe(true);
    expect(developer.recordSubmission).not.toHaveBeenCalled();
  });

  it('404s on unknown or archived forms', async () => {
    const { service } = build();
    await expect(service.submit('nope', {}, meta)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.submit('old', {}, meta)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid input with per-field errors and stores nothing', async () => {
    const { service, developer } = build();
    const err = await service
      .submit('contact-abc123', { full_name: 'Meera', mail: 'bad' }, meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().errors).toEqual({ mail: 'Enter a valid email address' });
    expect(developer.recordSubmission).not.toHaveBeenCalled();
  });

  it('runs bot checks and stores a valid submission through the shared intake', async () => {
    const { service, developer } = build();
    const res = await service.submit(
      'contact-abc123',
      { full_name: 'Meera', mail: 'meera@example.com', service: 'GST', turnstileToken: 't' },
      meta,
    );
    expect((res as { submissionId?: number }).submissionId).toBe(77);
    expect(developer.verifyBotChecks).toHaveBeenCalledWith(expect.any(Object), '1.2.3.4');
    const [org, key, dto] = developer.recordSubmission.mock.calls[0] as any[];
    expect(org.id).toBe(1);
    expect(key.id).toBe(9);
    expect(dto).toEqual({
      formName: 'Contact',
      name: 'Meera',
      email: 'meera@example.com',
      service: 'GST',
    });
  });
});

describe('slugify', () => {
  it('makes a url-safe base', () => {
    expect(slugify('  Tavaro: Contact Form! ')).toBe('tavaro-contact-form');
    expect(slugify('!!!')).toBe('');
  });
});

describe('FormsService for staff limited to some brands', () => {
  const staff = { id: 5, organizationId: 1, role: { name: 'ORG_EMPLOYEE' } } as never;

  function build(limit: number[]) {
    const rows = [
      { id: 1, organizationId: 1, businessUnitId: 11, apiKeyId: 9, name: 'Software form' },
      { id: 2, organizationId: 1, businessUnitId: 12, apiKeyId: 9, name: 'Solar form' },
    ];
    const forms = {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where }: { where: { id: number } }) => rows.find((r) => r.id === where.id) ?? null),
      save: jest.fn(async (x: unknown) => x),
    };
    const apiKeys = { find: jest.fn(async () => []), findOne: jest.fn(async () => ({ id: 9 })), save: jest.fn(async (x: unknown) => x) };
    const access = {
      brandLimitFor: jest.fn(async () => limit),
      assertBrand: jest.fn(async (_u: unknown, id: number | null) => {
        if (id == null || !limit.includes(id)) throw new NotFoundException('Form not found');
      }),
    };
    const service = new FormsService(
      forms as never,
      apiKeys as never,
      {} as never,
      { resolveUnitId: jest.fn(async (_o: number, id: number) => id) } as never,
      {} as never,
      access as never,
    );
    return { service, forms };
  }

  it('asks only for forms of their brands', async () => {
    const { service, forms } = build([11]);
    await service.list(staff);
    const where = (forms.find.mock.calls[0] as unknown as [{ where: { businessUnitId: { _value: number[] } } }])[0].where;
    expect(where.businessUnitId._value).toEqual([11]);
  });

  it('returns nothing when asked for another brand', async () => {
    const { service, forms } = build([11]);
    await expect(service.list(staff, 12)).resolves.toEqual([]);
    expect(forms.find).not.toHaveBeenCalled();
  });

  it('cannot edit a form of another brand, or move one into another brand', async () => {
    const { service, forms } = build([11]);
    await expect(service.update(staff, 2, { name: 'x' } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(staff, 1, { businessUnitId: 12 } as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(forms.save).not.toHaveBeenCalled();
  });
});
