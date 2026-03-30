import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Client } from '../entities/client.entity';
import { ClientDirector } from '../entities/client-director.entity';
import { EmailSchedule, EmailScheduleStatus } from '../entities/email-schedule.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { ScheduleEmailDto } from './dto/schedule-email.dto';

const DELAY_BETWEEN_EMAILS_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RecipientItem {
  email: string;
  name: string;
  type: 'client' | 'director' | 'org_user';
  clientId?: number;
  directorId?: number;
  organizationId?: number;
  userId?: number;
}

@Injectable()
export class MailManagementService {
  constructor(
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
    @InjectRepository(ClientDirector)
    private directorRepo: Repository<ClientDirector>,
    @InjectRepository(EmailSchedule)
    private scheduleRepo: Repository<EmailSchedule>,
    @InjectRepository(EmailTemplate)
    private templateRepo: Repository<EmailTemplate>,
    @InjectRepository(Organization)
    private organizationRepo: Repository<Organization>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private emailTemplatesService: EmailTemplatesService,
  ) {}

  /** Client emails + director emails + org user emails for dropdown. Master: all or by org (incl. org mails); Org: their org only. */
  async getRecipients(currentUser: User, organizationId?: number): Promise<RecipientItem[]> {
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      const where = organizationId != null ? { organizationId } : {};
      const clients = await this.clientRepo.find({ where, select: ['id', 'name', 'email', 'organizationId'] });
      const result: RecipientItem[] = [];
      for (const c of clients) {
        if (c.email) result.push({ email: c.email, name: c.name ?? c.email, type: 'client', clientId: c.id });
      }
      const directors = await this.directorRepo
        .createQueryBuilder('d')
        .innerJoin('d.client', 'c')
        .where(organizationId != null ? 'c.organizationId = :orgId' : '1=1', { orgId: organizationId })
        .select(['d.id', 'd.clientId', 'd.directorName', 'd.email'])
        .getMany();
      for (const d of directors) {
        if (d.email)
          result.push({
            email: d.email,
            name: d.directorName,
            type: 'director',
            clientId: d.clientId,
            directorId: d.id,
          });
      }
      // Master admin: include org users (org mails) - ORG_ADMIN, CAA, ORG_EMPLOYEE per org
      const orgUsers = await this.userRepo
        .createQueryBuilder('u')
        .innerJoin('u.organization', 'o')
        .innerJoin('u.role', 'r')
        .where('u.organizationId IS NOT NULL')
        .andWhere(organizationId != null ? 'u.organizationId = :organizationId' : '1=1', { organizationId })
        .andWhere("r.name IN ('ORG_ADMIN', 'CAA', 'ORG_EMPLOYEE')")
        .select(['u.id', 'u.email', 'u.name', 'u.organizationId'])
        .addSelect(['o.name'])
        .getRawMany();
      for (const row of orgUsers) {
        const name = row.u_name || row.o_name || row.u_email;
        result.push({
          email: row.u_email,
          name: name ?? row.u_email,
          type: 'org_user',
          organizationId: row.u_organizationId,
          userId: row.u_id,
        });
      }
      return result;
    }
    const orgId = currentUser.organizationId ?? organizationId;
    if (!orgId) return [];
    const clients = await this.clientRepo.find({
      where: { organizationId: orgId },
      select: ['id', 'name', 'email'],
    });
    const result: RecipientItem[] = [];
    for (const c of clients) {
      if (c.email) result.push({ email: c.email, name: c.name ?? c.email, type: 'client', clientId: c.id });
    }
    const directors = await this.directorRepo
      .createQueryBuilder('d')
      .innerJoin('d.client', 'c')
      .where('c.organizationId = :orgId', { orgId })
      .select(['d.id', 'd.clientId', 'd.directorName', 'd.email'])
      .getMany();
    for (const d of directors) {
      if (d.email)
        result.push({
          email: d.email,
          name: d.directorName,
          type: 'director',
          clientId: d.clientId,
          directorId: d.id,
        });
    }
    return result;
  }

  /** Master admin only: list org users (org mails) for sending - optionally by organizationId */
  async getOrgMails(currentUser: User, organizationId?: number): Promise<RecipientItem[]> {
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN) {
      throw new ForbiddenException('Only master admin can list org mails');
    }
    const qb = this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organization', 'o')
      .innerJoin('u.role', 'r')
      .where('u.organizationId IS NOT NULL')
      .andWhere("r.name IN ('ORG_ADMIN', 'CAA', 'ORG_EMPLOYEE')")
      .select(['u.id', 'u.email', 'u.name', 'u.organizationId'])
      .addSelect(['o.name']);
    if (organizationId != null) qb.andWhere('u.organizationId = :organizationId', { organizationId });
    const rows = await qb.getRawMany();
    return rows.map((row) => ({
      email: row.u_email,
      name: row.u_name || row.o_name || row.u_email,
      type: 'org_user' as const,
      organizationId: row.u_organizationId,
      userId: row.u_id,
    }));
  }

  /** Templates available for sending: master = only global; org = global + org's own */
  async getTemplatesForSending(currentUser: User) {
    return this.emailTemplatesService.findAllForSending(currentUser);
  }

  /** Normalise a day name/abbr to 0-6 (Sun=0 … Sat=6). Returns -1 if unrecognised. */
  private parseDayName(raw: string): number {
    const DAY_MAP: Record<string, number> = {
      sun: 0, sunday: 0,
      mon: 1, monday: 1,
      tue: 2, tues: 2, tuesday: 2,
      wed: 3, wednesday: 3,
      thu: 4, thur: 4, thurs: 4, thursday: 4,
      fri: 5, friday: 5,
      sat: 6, saturday: 6,
    };
    return DAY_MAP[raw.toLowerCase().trim()] ?? -1;
  }

  /** Expand schedule config to list of { date, time } slots */
  private expandScheduleToSlots(schedule: ScheduleEmailDto['schedule']): { date: string; time: string }[] {
    const slots: { date: string; time: string }[] = [];
    const times = schedule.times.filter((t) => t && String(t).trim());
    if (!times.length) return slots;

    const pushDate = (dateStr: string) => {
      for (const time of times) slots.push({ date: dateStr, time: time.trim() });
    };

    if (schedule.type === 'single_date' && schedule.date) {
      pushDate(schedule.date);
      return slots;
    }

    if (schedule.type === 'date_range' && schedule.fromDate && schedule.toDate) {
      const from = new Date(schedule.fromDate);
      const to = new Date(schedule.toDate);
      if (from > to) return slots;
      const cur = new Date(from);
      while (cur <= to) { pushDate(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
      return slots;
    }

    if (schedule.type === 'multiple_dates' && schedule.dates?.length) {
      for (const date of schedule.dates) { if (date) pushDate(date.trim()); }
      return slots;
    }

    // ── daily: every day in range ──
    if (schedule.type === 'daily' && schedule.fromDate && schedule.toDate) {
      const from = new Date(schedule.fromDate);
      const to = new Date(schedule.toDate);
      if (from > to) return slots;
      const cur = new Date(from);
      while (cur <= to) { pushDate(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
      return slots;
    }

    // ── weekly: every week on specified day(s) ──
    if (schedule.type === 'weekly' && schedule.fromDate && schedule.toDate) {
      const from = new Date(schedule.fromDate);
      const to = new Date(schedule.toDate);
      if (from > to) return slots;
      // Parse requested weekdays; default to all 7 if none given
      const targetDays: Set<number> = schedule.days?.length
        ? new Set(schedule.days.map((d) => this.parseDayName(d)).filter((n) => n >= 0))
        : new Set([0, 1, 2, 3, 4, 5, 6]);
      if (!targetDays.size) return slots;
      const cur = new Date(from);
      while (cur <= to) {
        if (targetDays.has(cur.getDay())) pushDate(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      return slots;
    }

    // ── monthly: same day each month in range ──
    if (schedule.type === 'monthly' && schedule.fromDate && schedule.toDate) {
      const from = new Date(schedule.fromDate);
      const to = new Date(schedule.toDate);
      if (from > to) return slots;
      const dom = schedule.dayOfMonth ?? from.getDate(); // default to fromDate's day
      const clamp = (d: Date, day: number) => {
        // clamp to last day of month if day > month length
        const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return Math.min(day, max);
      };
      let year = from.getFullYear();
      let month = from.getMonth();
      while (true) {
        const actualDay = clamp(new Date(year, month, 1), dom);
        const candidate = new Date(year, month, actualDay);
        if (candidate > to) break;
        if (candidate >= from) pushDate(candidate.toISOString().slice(0, 10));
        month++;
        if (month > 11) { month = 0; year++; }
      }
      return slots;
    }

    return slots;
  }

  /**
   * Parse date + time to UTC Date for storage.
   * If timeZoneOffset is provided (e.g. "+05:30", "-08:00"), date+time are interpreted as local in that zone and converted to UTC.
   * Otherwise they are interpreted as UTC (legacy).
   */
  private slotToScheduledAt(dateStr: string, timeStr: string, timeZoneOffset?: string): Date {
    const parts = timeStr.trim().split(':');
    const hour = Math.min(23, Math.max(0, Number.isNaN(Number(parts[0])) ? 0 : Number(parts[0])));
    const minute = Math.min(59, Math.max(0, Number.isNaN(Number(parts[1])) ? 0 : Number(parts[1])));
    const second = parts.length >= 3 ? (Number.isNaN(Number(parts[2])) ? 0 : Number(parts[2])) : 0;
    const timePart = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

    if (timeZoneOffset && /^[+-]\d{2}:?\d{2}$/.test(timeZoneOffset.replace(':', ''))) {
      const off = timeZoneOffset.replace(':', '');
      const offsetIso = off.length === 5 ? `${off.slice(0, 3)}:${off.slice(3)}` : timeZoneOffset;
      const iso = `${dateStr}T${timePart}${offsetIso}`;
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(dateStr + 'T00:00:00.000Z');
    d.setUTCHours(hour, minute, second, 0);
    return d;
  }

  async createSchedule(dto: ScheduleEmailDto, currentUser: User): Promise<{ created: number; schedules: EmailSchedule[] }> {
    let templateRef: EmailTemplate | null = null;
    if (dto.templateId != null) {
      templateRef = await this.templateRepo.findOne({ where: { id: dto.templateId } });
      if (!templateRef) throw new NotFoundException('Template not found');
      if (!this.canUseTemplateForSending(currentUser, templateRef)) {
        throw new ForbiddenException('You can only send using your allowed templates (master: global only; org: global or org templates)');
      }
    } else {
      if (!dto.subject?.trim()) throw new BadRequestException('subject is required for custom scheduled emails');
      if (!dto.body?.trim()) throw new BadRequestException('body is required for custom scheduled emails');
    }

    const slots = this.expandScheduleToSlots(dto.schedule);
    if (!slots.length) throw new BadRequestException('Schedule produced no date/time slots. Check date range and times.');

    const organizationId = currentUser.role?.name === RoleName.MASTER_ADMIN
      ? (templateRef?.organizationId ?? null)
      : currentUser.organizationId;
    const createdBy = currentUser.id;
    const recipientEmails = [...new Set(dto.recipientEmails)];

    const timeZoneOffset = dto.schedule.timeZoneOffset;
    const schedules: EmailSchedule[] = [];
    for (const slot of slots) {
      const scheduledAt = this.slotToScheduledAt(slot.date, slot.time, timeZoneOffset);
      const schedule = this.scheduleRepo.create({
        templateId: dto.templateId ?? null,
        subject: dto.templateId == null ? dto.subject!.trim() : null,
        body: dto.templateId == null ? dto.body!.trim() : null,
        recipientEmails,
        variables: dto.variables ?? null,
        scheduledAt,
        status: 'pending',
        organizationId,
        createdBy,
      });
      schedules.push(await this.scheduleRepo.save(schedule));
    }
    return { created: schedules.length, schedules };
  }

  async listSchedules(currentUser: User, status?: EmailScheduleStatus, organizationId?: number) {
    const qb = this.scheduleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.template', 't')
      .orderBy('s.id', 'DESC');
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      if (organizationId != null) qb.andWhere('s.organizationId = :organizationId', { organizationId });
    } else {
      const orgId = currentUser.organizationId;
      if (!orgId) return [];
      qb.andWhere('s.organizationId = :orgId', { orgId });
    }
    if (status) qb.andWhere('s.status = :status', { status });
    return qb.getMany();
  }

  async getSchedule(id: number, currentUser: User): Promise<EmailSchedule> {
    const schedule = await this.scheduleRepo.findOne({ where: { id }, relations: ['template'] });
    if (!schedule) throw new NotFoundException('Schedule not found');
    if (!this.canAccessSchedule(currentUser, schedule)) throw new ForbiddenException('Access denied');
    return schedule;
  }

  async updateSchedule(
    id: number,
    dto: { scheduledAt?: string; recipientEmails?: string[]; variables?: Record<string, string> },
    currentUser: User,
  ): Promise<EmailSchedule> {
    const schedule = await this.getSchedule(id, currentUser);
    if (schedule.status !== 'pending')
      throw new BadRequestException('Only pending schedules can be edited');
    if (dto.scheduledAt != null) {
      const d = new Date(dto.scheduledAt);
      if (isNaN(d.getTime())) throw new BadRequestException('Invalid scheduledAt value');
      schedule.scheduledAt = d;
    }
    if (dto.recipientEmails != null) schedule.recipientEmails = dto.recipientEmails;
    if (dto.variables != null) schedule.variables = dto.variables;
    return this.scheduleRepo.save(schedule);
  }

  async cancelSchedule(id: number, currentUser: User): Promise<EmailSchedule> {
    const schedule = await this.getSchedule(id, currentUser);
    if (schedule.status !== 'pending') throw new BadRequestException('Only pending schedules can be cancelled');
    schedule.status = 'cancelled';
    return this.scheduleRepo.save(schedule);
  }

  private canUseTemplateForSending(user: User, template: EmailTemplate): boolean {
    if (user.role?.name === RoleName.MASTER_ADMIN) return template.organizationId == null;
    return template.organizationId == null || template.organizationId === user.organizationId;
  }

  private canAccessSchedule(user: User, schedule: EmailSchedule): boolean {
    if (user.role?.name === RoleName.MASTER_ADMIN) return true;
    return schedule.organizationId === user.organizationId;
  }

  /** Process pending schedules due now: send to each recipient with 2 sec delay. Called by cron. */
  async processDueSchedules(): Promise<{ processed: number; sent: number; failed: number }> {
    const now = new Date();
    const pending = await this.scheduleRepo.find({
      where: { status: 'pending', scheduledAt: LessThanOrEqual(now) },
      relations: ['template'],
      order: { scheduledAt: 'ASC' },
    });
    let sent = 0;
    let failed = 0;
    for (const schedule of pending) {
      const isCustom = schedule.templateId == null;

      // Custom email: needs stored subject + body
      if (isCustom && (!schedule.subject?.trim() || !schedule.body?.trim())) {
        schedule.status = 'failed';
        schedule.errorMessage = 'Custom email missing subject or body';
        await this.scheduleRepo.save(schedule);
        failed++;
        continue;
      }

      // Template email: needs a valid template
      if (!isCustom && !schedule.template) {
        schedule.status = 'failed';
        schedule.errorMessage = 'Template not found';
        await this.scheduleRepo.save(schedule);
        failed++;
        continue;
      }

      const variables = { ...(schedule.variables ?? {}) };
      let fromName: string | undefined;
      if (schedule.organizationId != null) {
        const org = await this.organizationRepo.findOne({ where: { id: schedule.organizationId } });
        variables.org_name = org?.name ?? '';
        const orgAdmin = await this.userRepo
          .createQueryBuilder('u')
          .innerJoin('u.role', 'r')
          .where('u.organizationId = :orgId', { orgId: schedule.organizationId })
          .andWhere('r.name = :roleName', { roleName: RoleName.ORG_ADMIN })
          .select(['u.id', 'u.name', 'u.email', 'u.phone'])
          .getOne();
        if (orgAdmin) {
          variables.org_admin_name = orgAdmin.name ?? orgAdmin.email ?? '';
          variables.org_email = orgAdmin.email ?? '';
          variables.org_phone = (orgAdmin as any).phone ?? '';
          fromName = orgAdmin.name ?? orgAdmin.email;
        } else {
          const creator = await this.userRepo.findOne({
            where: { id: schedule.createdBy },
            select: ['id', 'name', 'email', 'phone'],
          });
          variables.org_admin_name = creator?.name ?? creator?.email ?? '';
          variables.org_email = creator?.email ?? '';
          variables.org_phone = creator?.phone ?? '';
          fromName = creator?.name ?? creator?.email;
        }
      }

      let anySent = false;
      let lastError: string | null = null;
      for (let i = 0; i < schedule.recipientEmails.length; i++) {
        if (i > 0) await delay(DELAY_BETWEEN_EMAILS_MS);
        const to = schedule.recipientEmails[i];
        try {
          let ok: boolean;
          if (isCustom) {
            ok = await this.emailTemplatesService.sendCustomInternal(
              to,
              schedule.subject!,
              schedule.body!,
              variables,
              fromName,
            );
          } else {
            ok = await this.emailTemplatesService.sendWithTemplateInternal(
              to,
              schedule.template!,
              variables,
              fromName,
            );
          }
          if (ok) { sent++; anySent = true; }
          else lastError = 'Send returned false';
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          failed++;
        }
      }
      schedule.status = anySent ? 'sent' : 'failed';
      schedule.sentAt = new Date();
      schedule.errorMessage = lastError;
      await this.scheduleRepo.save(schedule);
    }
    return { processed: pending.length, sent, failed };
  }
}
