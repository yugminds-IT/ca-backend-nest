import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Organization } from '../entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { SmtpConfigDto, TestSmtpDto } from './dto/smtp-config.dto';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { EmailService } from '../email/email.service';
import { deriveKey, encrypt, decrypt } from '../common/utils/crypto.util';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private repo: Repository<Organization>,
    private emailService: EmailService,
    private config: ConfigService,
  ) {}

  private slugify(text: string): string {
    return (
      text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'org'
    );
  }

  private getEncryptionKey(): Buffer {
    const k =
      this.config.get<string>('SMTP_ENCRYPTION_KEY') ??
      'navedhana-smtp-default-key-change-in-prod';
    return deriveKey(k);
  }

  async create(dto: CreateOrganizationDto, currentUser: User): Promise<Organization> {
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN) {
      throw new ForbiddenException('Only master admin can create organizations');
    }
    let slug = dto.slug ?? this.slugify(dto.name);
    let counter = 0;
    const baseSlug = slug;
    while (await this.repo.findOne({ where: { slug } })) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }
    const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
    return this.repo.save(
      this.repo.create({
        ...dto,
        slug,
        approvalStatus: 'approved',
        approvedAt: new Date(),
        accessUntil: new Date(Date.now() + tenYearsMs),
      }),
    );
  }

  async findAll(currentUser: User): Promise<Organization[]> {
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      return this.repo.find({ order: { name: 'ASC' } });
    }
    if (currentUser.organizationId) {
      return this.repo.find({
        where: { id: currentUser.organizationId },
        order: { name: 'ASC' },
      });
    }
    return [];
  }

  async findOne(id: number, currentUser: User): Promise<Organization> {
    const org = await this.repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (
      currentUser.role?.name !== RoleName.MASTER_ADMIN &&
      currentUser.organizationId !== id
    ) {
      throw new ForbiddenException('Access denied');
    }
    return org;
  }

  async update(id: number, dto: UpdateOrganizationDto, currentUser: User): Promise<Organization> {
    if (
      currentUser.role?.name !== RoleName.MASTER_ADMIN &&
      currentUser.organizationId !== id
    ) {
      throw new ForbiddenException('Only master admin or org admin can update');
    }
    const org = await this.findOne(id, currentUser);
    if (dto.slug && dto.slug !== org.slug) {
      const existing = await this.repo.findOne({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException('Slug already in use');
    }
    Object.assign(org, dto);
    return this.repo.save(org);
  }

  async remove(id: number, currentUser: User): Promise<void> {
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN) {
      throw new ForbiddenException('Only master admin can delete organizations');
    }
    const org = await this.repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    await this.repo.remove(org);
  }

  // ─── SMTP Config ───────────────────────────────────────────────────────────

  private canManageSmtp(currentUser: User, orgId: number): boolean {
    return (
      currentUser.role?.name === RoleName.MASTER_ADMIN ||
      (currentUser.role?.name === RoleName.ORG_ADMIN &&
        currentUser.organizationId === orgId)
    );
  }

  /** Return SMTP config with password masked */
  async getSmtpConfig(id: number, currentUser: User) {
    if (!this.canManageSmtp(currentUser, id)) throw new ForbiddenException('Access denied');
    const org = await this.repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return {
      configured: !!(org.smtpHost && org.smtpUser && org.smtpPass),
      smtpHost: org.smtpHost,
      smtpPort: org.smtpPort,
      smtpSecure: org.smtpSecure,
      smtpUser: org.smtpUser,
      smtpFrom: org.smtpFrom,
    };
  }

  /** Save (create or replace) SMTP config — password is encrypted before storing */
  async saveSmtpConfig(
    id: number,
    dto: SmtpConfigDto,
    currentUser: User,
  ): Promise<{ message: string }> {
    if (!this.canManageSmtp(currentUser, id)) throw new ForbiddenException('Access denied');
    const org = await this.repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');

    org.smtpHost = dto.smtpHost;
    org.smtpPort = dto.smtpPort;
    org.smtpSecure = dto.smtpSecure;
    org.smtpUser = dto.smtpUser;
    org.smtpPass = encrypt(dto.smtpPass, this.getEncryptionKey());
    org.smtpFrom = dto.smtpFrom ?? dto.smtpUser;

    await this.repo.save(org);
    this.emailService.invalidateOrgTransporter(id);
    return { message: 'SMTP configuration saved successfully' };
  }

  /** Remove SMTP config — org will fall back to global SMTP */
  async clearSmtpConfig(id: number, currentUser: User): Promise<{ message: string }> {
    if (!this.canManageSmtp(currentUser, id)) throw new ForbiddenException('Access denied');
    const org = await this.repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');

    org.smtpHost = null;
    org.smtpPort = null;
    org.smtpSecure = null;
    org.smtpUser = null;
    org.smtpPass = null;
    org.smtpFrom = null;

    await this.repo.save(org);
    this.emailService.invalidateOrgTransporter(id);
    return { message: 'SMTP configuration removed. Global SMTP will be used.' };
  }

  /** Verify saved SMTP config and send a test email */
  async testSmtpConfig(
    id: number,
    dto: TestSmtpDto,
    currentUser: User,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.canManageSmtp(currentUser, id)) throw new ForbiddenException('Access denied');
    const org = await this.repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (!org.smtpHost || !org.smtpUser || !org.smtpPass) {
      throw new BadRequestException('No SMTP config saved for this organization');
    }

    let pass: string;
    try {
      pass = decrypt(org.smtpPass, this.getEncryptionKey());
    } catch {
      throw new BadRequestException(
        'SMTP password could not be decrypted — this usually means SMTP_ENCRYPTION_KEY changed after the config was saved. Re-save your SMTP configuration to fix this.',
      );
    }

    try {
      await this.emailService.verifySmtpConfig(
        org.smtpHost,
        org.smtpPort ?? 587,
        org.smtpSecure ?? false,
        org.smtpUser,
        pass,
      );
    } catch (err) {
      return {
        success: false,
        message: `SMTP connection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const sent = await this.emailService.sendMail(
      dto.testEmail,
      'Test Email — SMTP Configuration',
      `This is a test email from ${org.name} to verify your SMTP configuration.`,
      `<p>This is a test email from <strong>${org.name}</strong> to verify your SMTP configuration.</p><p>If you received this, your SMTP settings are working correctly.</p>`,
      org.name,
      id,
    );

    return sent
      ? { success: true, message: `Test email sent to ${dto.testEmail}` }
      : { success: false, message: 'SMTP verified but failed to send test email' };
  }
}
