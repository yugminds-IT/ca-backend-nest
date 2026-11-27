import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { encrypt } from '../common/utils/crypto.util';
import { getSmtpEncryptionKey } from '../common/utils/smtp-key';
import { MailAccount } from '../entities/mail-account.entity';
import { toMailAccountView } from '../mail-accounts/mail-accounts.service';

const mockSend = jest.fn().mockResolvedValue({ messageId: 'ok' });
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSend }));

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...(args as [])),
}));

const SMTP_KEY = 'test-smtp-key-for-unit-tests-only';

const config = new ConfigService({
  SMTP_ENCRYPTION_KEY: SMTP_KEY,
  FRONTEND_URL: 'https://app.example.com',
});

const encryptedPass = encrypt('mailbox-secret', getSmtpEncryptionKey(config));

function account(overrides: Partial<MailAccount>): MailAccount {
  return {
    id: 1,
    organizationId: 7,
    businessUnitId: null,
    label: 'Account',
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    username: 'mailer@example.com',
    passwordEncrypted: encryptedPass,
    fromEmail: 'org@example.com',
    fromName: null,
    whiteLabel: false,
    isActive: true,
    lastVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as MailAccount;
}

/**
 * Mimics the repository: a numeric businessUnitId matches a unit account. Anything else
 * (the IsNull() operator) matches the organization-wide account.
 */
function buildService(accounts: { unit?: MailAccount; orgWide?: MailAccount }) {
  const mailAccountRepo = {
    findOne: jest.fn(async ({ where }: { where: { businessUnitId: unknown } }) => {
      if (typeof where.businessUnitId === 'number') {
        return accounts.unit && accounts.unit.businessUnitId === where.businessUnitId ? accounts.unit : null;
      }
      return accounts.orgWide ?? null;
    }),
  };
  const orgRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, smtpHost: null }) };
  const service = new EmailService(config, orgRepo as never, mailAccountRepo as never);
  return service;
}

describe('EmailService outbound account resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends from the unit account, with the Lekvya footer, when the unit has one', async () => {
    const service = buildService({
      unit: account({ id: 10, businessUnitId: 5, fromEmail: 'resorts@tavaro.example' }),
      orgWide: account({ id: 11, fromEmail: 'org@example.com' }),
    });

    await service.sendMail('guest@example.com', 'Hi', 'Hello', '<p>Hello</p>', undefined, 7, undefined, undefined, 5);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sent = mockSend.mock.calls[0][0];
    expect(sent.from).toBe('resorts@tavaro.example');
    expect(sent.html).toContain('lekvya-email-footer');
  });

  it('uses the organization-wide account when the unit has none', async () => {
    const service = buildService({
      orgWide: account({ id: 11, fromEmail: 'org@example.com' }),
    });

    await service.sendMail('guest@example.com', 'Hi', 'Hello', '<p>Hello</p>', undefined, 7, undefined, undefined, 99);

    expect(mockSend.mock.calls[0][0].from).toBe('org@example.com');
  });

  it('skips the Lekvya footer for a white-label account', async () => {
    const service = buildService({
      unit: account({ id: 10, businessUnitId: 5, fromEmail: 'mare@tavaro.example', whiteLabel: true }),
    });

    await service.sendMail('guest@example.com', 'Hi', 'Hello', '<p>Hello</p>', undefined, 7, undefined, undefined, 5);

    const sent = mockSend.mock.calls[0][0];
    expect(sent.from).toBe('mare@tavaro.example');
    expect(sent.html).not.toContain('lekvya-email-footer');
    expect(sent.text).not.toContain('Lekvya');
  });

  it('uses the account display name when the caller does not pass one', async () => {
    const service = buildService({
      unit: account({ id: 10, businessUnitId: 5, fromEmail: 'resorts@tavaro.example', fromName: 'Tavaro Resorts' }),
    });

    await service.sendMail('guest@example.com', 'Hi', 'Hello', '<p>Hello</p>', undefined, 7, undefined, undefined, 5);

    expect(mockSend.mock.calls[0][0].from).toBe('"Tavaro Resorts" <resorts@tavaro.example>');
  });

  it('returns false and sends nothing when no account and no SMTP is configured', async () => {
    const service = buildService({});
    const ok = await service.sendMail('guest@example.com', 'Hi', 'Hello', undefined, undefined, 7, undefined, undefined, 5);
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('getOutboundFromAddress returns the unit account address for the developer API From header', async () => {
    const service = buildService({
      unit: account({ id: 10, businessUnitId: 5, fromEmail: 'resorts@tavaro.example' }),
    });
    await expect(service.getOutboundFromAddress(7, 5)).resolves.toBe('resorts@tavaro.example');
    await expect(service.getOutboundFromAddress(7, 6)).resolves.toBeNull();
  });
});

describe('toMailAccountView', () => {
  it('never exposes the encrypted password', () => {
    const view = toMailAccountView(account({ passwordEncrypted: 'iv:tag:secret-cipher' }));
    expect(JSON.stringify(view)).not.toContain('secret-cipher');
    expect(view).not.toHaveProperty('passwordEncrypted');
  });
});
