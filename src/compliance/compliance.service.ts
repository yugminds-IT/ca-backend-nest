import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes } from 'crypto';
import * as dns from 'dns';
import { SuppressionList, SuppressionReason } from '../entities/suppression-list.entity';
import { Organization } from '../entities/organization.entity';

const DNS_PROMISES = dns.promises;
const UNCONF_SECRET = process.env.SECRET_KEY || 'caa-compliance-unsubscribe-secret-salt-2026';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectRepository(SuppressionList)
    private suppressionRepo: Repository<SuppressionList>,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
  ) {}

  // ------------------------------------------------------------- Suppression Checking
  async isSuppressed(orgId: number, email: string): Promise<boolean> {
    const cleanEmail = email.trim().toLowerCase();
    const count = await this.suppressionRepo.count({
      where: { organizationId: orgId, email: cleanEmail },
    });
    return count > 0;
  }

  async addSuppression(
    orgId: number,
    email: string,
    reason: SuppressionReason = 'unsubscribed',
    source: string = 'One-Click Unsubscribe',
  ): Promise<SuppressionList> {
    const cleanEmail = email.trim().toLowerCase();
    const existing = await this.suppressionRepo.findOne({
      where: { organizationId: orgId, email: cleanEmail },
    });
    if (existing) return existing;

    const entry = this.suppressionRepo.create({
      organizationId: orgId,
      email: cleanEmail,
      reason,
      source,
    });
    return this.suppressionRepo.save(entry);
  }

  async removeSuppression(orgId: number, id: number): Promise<{ success: boolean }> {
    const entry = await this.suppressionRepo.findOne({ where: { id, organizationId: orgId } });
    if (!entry) throw new NotFoundException('Suppression entry not found');
    await this.suppressionRepo.remove(entry);
    return { success: true };
  }

  async listSuppressions(orgId: number, search?: string): Promise<SuppressionList[]> {
    const qb = this.suppressionRepo
      .createQueryBuilder('s')
      .where('s.organizationId = :orgId', { orgId });

    if (search?.trim()) {
      qb.andWhere('LOWER(s.email) LIKE :search', {
        search: `%${search.trim().toLowerCase()}%`,
      });
    }

    return qb.orderBy('s.createdAt', 'DESC').take(100).getMany();
  }

  // ------------------------------------------------------------- Unsubscribe Tokens (RFC 8058)
  generateUnsubscribeToken(email: string, orgId: number): string {
    const data = `${email.trim().toLowerCase()}:${orgId}`;
    const hmac = createHmac('sha256', UNCONF_SECRET).update(data).digest('hex');
    const payload = Buffer.from(`${data}:${hmac}`).toString('base64url');
    return payload;
  }

  verifyUnsubscribeToken(token: string): { email: string; orgId: number } {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length !== 3) throw new BadRequestException('Invalid token format');

      const [email, orgIdStr, signature] = parts;
      const data = `${email}:${orgIdStr}`;
      const expected = createHmac('sha256', UNCONF_SECRET).update(data).digest('hex');

      if (signature !== expected) {
        throw new BadRequestException('Invalid or expired token signature');
      }

      return { email, orgId: Number(orgIdStr) };
    } catch {
      throw new BadRequestException('Invalid unsubscribe token');
    }
  }

  // ------------------------------------------------------------- DNS Deliverability Verification
  async checkDomainDns(domain: string) {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();

    let spfRecord: string | null = null;
    let dmarcRecord: string | null = null;

    // 1. Resolve SPF TXT
    try {
      const txtRecords = await DNS_PROMISES.resolveTxt(cleanDomain);
      for (const group of txtRecords) {
        const joined = group.join('');
        if (joined.startsWith('v=spf1')) {
          spfRecord = joined;
          break;
        }
      }
    } catch {
      spfRecord = null;
    }

    // 2. Resolve DMARC TXT (_dmarc.domain)
    try {
      const dmarcRecords = await DNS_PROMISES.resolveTxt(`_dmarc.${cleanDomain}`);
      for (const group of dmarcRecords) {
        const joined = group.join('');
        if (joined.startsWith('v=DMARC1')) {
          dmarcRecord = joined;
          break;
        }
      }
    } catch {
      dmarcRecord = null;
    }

    return {
      domain: cleanDomain,
      spf: {
        valid: !!spfRecord,
        record: spfRecord || 'No SPF record found (recommended: v=spf1 include:... ~all)',
      },
      dmarc: {
        valid: !!dmarcRecord,
        record: dmarcRecord || 'No DMARC record found (recommended: v=DMARC1; p=none)',
      },
      recommendedRecords: {
        spf: 'v=spf1 include:_spf.google.com ~all',
        dmarc: `v=DMARC1; p=none; rua=mailto:dmarc-reports@${cleanDomain}`,
      },
      dkim: {
        recommendedSelector: `caa._domainkey.${cleanDomain}`,
        instructions: 'Add a CNAME or TXT record for DKIM signature alignment in your DNS registrar (GoDaddy, Cloudflare, Namecheap).',
      },
      checkedAt: new Date(),
    };
  }
}
