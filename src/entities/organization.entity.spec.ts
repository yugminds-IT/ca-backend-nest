import { instanceToPlain } from 'class-transformer';
import { Organization } from './organization.entity';
import { Client } from './client.entity';

describe('Organization serialization', () => {
  it('never puts the SMTP password in a response, even nested in a client', () => {
    const org = Object.assign(new Organization(), { id: 2, smtpHost: 'smtp.x.com', smtpPass: 'enc:secret' });
    const client = Object.assign(new Client(), { id: 1, organization: org });
    expect(instanceToPlain(org)).not.toHaveProperty('smtpPass');
    expect(instanceToPlain({ ...client })).toMatchObject({ organization: { smtpHost: 'smtp.x.com' } });
    expect(JSON.stringify(instanceToPlain({ ...client }))).not.toContain('enc:secret');
    expect(org.smtpPass).toBe('enc:secret'); // still there for sending mail
  });
});
