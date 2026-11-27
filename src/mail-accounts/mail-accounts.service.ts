import { BillingService } from '../billing/billing.service';
import { friendlySmtpError } from '../email/smtp-transport.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { MailAccount } from '../entities/mail-account.entity';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { resolveTenantScope } from '../common/utils/tenant-scope.util';
import { decrypt, encrypt } from '../common/utils/crypto.util';
import { getSmtpEncryptionKey } from '../common/utils/smtp-key';
import { EmailService } from '../email/email.service';
import { BusinessUnitsService } from '../business-units/business-units.service';
import {
  CreateMailAccountDto,
  UpdateMailAccountDto,
} from './dto/mail-account.dto';

/** What the API returns. The password is never included. */
export interface MailAccountView {
  id: number;
  organizationId: number;
  businessUnitId: number | null;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
  whiteLabel: boolean;
  isActive: boolean;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toMailAccountView(a: MailAccount): MailAccountView {
  return {
    id: a.id,
    organizationId: a.organizationId,
    businessUnitId: a.businessUnitId,
    label: a.label,
    host: a.host,
    port: a.port,
    secure: a.secure,
    username: a.username,
    fromEmail: a.fromEmail,
    fromName: a.fromName,
    whiteLabel: a.whiteLabel,
    isActive: a.isActive,
    lastVerifiedAt: a.lastVerifiedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

@Injectable()
export class MailAccountsService {
  constructor(
    private readonly billing: BillingService,
    @InjectRepository(MailAccount)
    private readonly repo: Repository<MailAccount>,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly businessUnits: BusinessUnitsService,
  ) {}

  /** businessUnitId: a unit id, null for organization-wide accounts, undefined for all. */
  async list(
    user: User,
    requestedOrgId?: number,
    businessUnitId?: number | null,
  ): Promise<MailAccountView[]> {
    const orgId = this.requireOrgId(user, requestedOrgId);
    const where: Record<string, unknown> = { organizationId: orgId };
    if (businessUnitId !== undefined)
      where.businessUnitId = businessUnitId ?? IsNull();
    const rows = await this.repo.find({
      where,
      order: { isActive: 'DESC', label: 'ASC' },
    });
    return rows.map(toMailAccountView);
  }

  async create(
    user: User,
    dto: CreateMailAccountDto,
  ): Promise<MailAccountView> {
    const orgId = this.requireOrgId(user, dto.organizationId);
    if (dto.whiteLabel === true) await this.billing.assertEntitled(orgId, { feature: 'whiteLabel' });
    const unitId =
      dto.businessUnitId == null
        ? null
        : await this.businessUnits.resolveUnitId(orgId, dto.businessUnitId);

    const existing = await this.repo.findOne({
      where: {
        organizationId: orgId,
        businessUnitId: unitId ?? IsNull(),
        isActive: true,
      },
    });
    if (existing) {
      throw new ConflictException(
        'This unit already has an active mail account. Deactivate it before adding another.',
      );
    }

    const saved = await this.repo.save(
      this.repo.create({
        organizationId: orgId,
        businessUnitId: unitId,
        label: dto.label.trim(),
        host: dto.host.trim(),
        port: dto.port,
        secure: dto.secure,
        username: dto.username.trim(),
        passwordEncrypted: this.encryptPassword(dto.password),
        fromEmail: dto.fromEmail.trim().toLowerCase(),
        fromName: dto.fromName?.trim() || null,
        whiteLabel: dto.whiteLabel ?? false,
        isActive: true,
        lastVerifiedAt: null,
      }),
    );
    return toMailAccountView(saved);
  }

  async update(
    user: User,
    id: number,
    dto: UpdateMailAccountDto,
  ): Promise<MailAccountView> {
    const account = await this.findOwned(user, id);
    if (dto.whiteLabel === true) await this.billing.assertEntitled(account.organizationId, { feature: 'whiteLabel' });

    if (dto.isActive === true && !account.isActive) {
      const clash = await this.repo.findOne({
        where: {
          organizationId: account.organizationId,
          businessUnitId: account.businessUnitId ?? IsNull(),
          isActive: true,
        },
      });
      if (clash) {
        throw new ConflictException(
          'This unit already has an active mail account.',
        );
      }
    }

    const connectionChanged =
      dto.host !== undefined ||
      dto.port !== undefined ||
      dto.secure !== undefined ||
      dto.username !== undefined ||
      dto.password !== undefined;
    if (dto.label !== undefined) account.label = dto.label.trim();
    if (dto.host !== undefined) account.host = dto.host.trim();
    if (dto.port !== undefined) account.port = dto.port;
    if (dto.secure !== undefined) account.secure = dto.secure;
    if (dto.username !== undefined) account.username = dto.username.trim();
    if (dto.password !== undefined)
      account.passwordEncrypted = this.encryptPassword(dto.password);
    if (dto.fromEmail !== undefined)
      account.fromEmail = dto.fromEmail.trim().toLowerCase();
    if (dto.fromName !== undefined)
      account.fromName = dto.fromName?.trim() || null;
    if (dto.whiteLabel !== undefined) account.whiteLabel = dto.whiteLabel;
    if (dto.isActive !== undefined) account.isActive = dto.isActive;
    // A changed connection has not been verified yet.
    if (connectionChanged) account.lastVerifiedAt = null;

    const saved = await this.repo
      .save(account)
      .catch((err: { code?: string }) => {
        if (err?.code === '23505') {
          throw new ConflictException(
            'This unit already has an active mail account.',
          );
        }
        throw err;
      });
    this.email.invalidateMailAccountTransporter(saved.id);
    return toMailAccountView(saved);
  }

  /** Deactivates rather than deletes, so the configuration can be restored. */
  async deactivate(user: User, id: number): Promise<MailAccountView> {
    return this.update(user, id, { isActive: false });
  }

  /** Logs in to the SMTP server with the stored credentials. Records the time on success. */
  async verify(user: User, id: number): Promise<MailAccountView> {
    const account = await this.findOwned(user, id);
    let pass: string;
    try {
      pass = decrypt(
        account.passwordEncrypted,
        getSmtpEncryptionKey(this.config),
      );
    } catch {
      throw new BadRequestException(
        'The stored password cannot be decrypted. Enter the password again.',
      );
    }
    try {
      await this.email.verifySmtpConfig(
        account.host,
        account.port,
        account.secure,
        account.username,
        pass,
      );
    } catch (err) {
      throw new BadRequestException(
        `SMTP login failed: ${friendlySmtpError((err as Error).message)}`,
      );
    }
    account.lastVerifiedAt = new Date();
    const saved = await this.repo.save(account);
    return toMailAccountView(saved);
  }

  private encryptPassword(password: string): string {
    return encrypt(password, getSmtpEncryptionKey(this.config));
  }

  private requireOrgId(user: User, requestedOrgId?: number | null): number {
    if (user.role?.name === RoleName.CLIENT)
      throw new ForbiddenException('Access denied');
    const scope = resolveTenantScope(user, requestedOrgId ?? null);
    if (scope.organizationId == null) {
      throw new BadRequestException(
        'organizationId is required for this request',
      );
    }
    return scope.organizationId;
  }

  /** Other organizations' accounts look like "not found", not "forbidden". */
  private async findOwned(user: User, id: number): Promise<MailAccount> {
    if (user.role?.name === RoleName.CLIENT)
      throw new ForbiddenException('Access denied');
    const account = await this.repo.findOne({ where: { id } });
    const isMasterAdmin = user.role?.name === RoleName.MASTER_ADMIN;
    if (
      !account ||
      (!isMasterAdmin && account.organizationId !== user.organizationId)
    ) {
      throw new NotFoundException('Mail account not found');
    }
    return account;
  }
}
