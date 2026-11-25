import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { Client } from '../entities/client.entity';
import { ClientDirector } from '../entities/client-director.entity';
import { EmailSchedule, EmailScheduleStatus } from '../entities/email-schedule.entity';
import { EmailRecurringSchedule } from '../entities/email-recurring-schedule.entity';
import { EmailTemplate } from '../entities/email-template.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { ScheduleEmailDto } from './dto/schedule-email.dto';
import { SendBulkDto } from './dto/send-bulk.dto';
import { EventsGateway } from '../events/events.gateway';
import { decryptPlainPassword } from '../common/encryption';
import { mergeVariables, usedVariables } from '../email-templates/template-render';
import { CustomVariablesService, RESERVED_KEYS } from '../custom-variables/custom-variables.service';
import { S3Service } from '../s3/s3.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AttachmentRef, checkAttachmentRefs } from './mail-attachments';
import { SegmentsService } from '../clients/segments.service';
import { localDay } from '../clients/segment-rules';
import { clientVariables } from '../clients/client-variables';
import { firstFrontendUrl } from '../email/email.service';
import type { BulkSegmentDto } from './dto/send-bulk.dto';
import type { ScheduleSegment } from '../entities/email-schedule.entity';
import { EmailDelivery, DeliveryStatus } from '../entities/email-delivery.entity';
import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { firesOn } from './repeat-rule';

/** One entry per unique (lower-cased) email; first occurrence's variables and files win. */
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Every Cc/Bcc entry ("a@b.com" or "Name <a@b.com>", comma/semicolon separated) must be an address. */
export function checkCopyAddresses(cc?: string | null, bcc?: string | null) {
  for (const [name, value] of [['Cc', cc], ['Bcc', bcc]] as const) {
    for (const piece of (value ?? '').split(/[,;\n]+/)) {
      const p = piece.trim();
      if (!p) continue;
      const addr = (p.match(/<([^>]*)>/)?.[1] ?? p).trim();
      if (!EMAIL.test(addr)) throw new BadRequestException(`${name} has something that isn't an email address: ${p}`);
    }
  }
}

function collectRecipients(recipients: { email: string; variables?: Record<string, string>; attachments?: AttachmentRef[] }[]) {
  const recipientVariables: Record<string, Record<string, string>> = {};
  const recipientAttachments: Record<string, AttachmentRef[]> = {};
  for (const r of recipients) {
    const email = r.email.trim().toLowerCase();
    if (email in recipientVariables) continue;
    recipientVariables[email] = r.variables ?? {};
    if (r.attachments?.length) recipientAttachments[email] = r.attachments;
  }
  return { recipientVariables, recipientAttachments, recipientEmails: Object.keys(recipientVariables) };
}

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
    @InjectRepository(EmailRecurringSchedule)
    private recurringRepo: Repository<EmailRecurringSchedule>,
    @InjectRepository(EmailTemplate)
    private templateRepo: Repository<EmailTemplate>,
    @InjectRepository(Organization)
    private organizationRepo: Repository<Organization>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private emailTemplatesService: EmailTemplatesService,
    private readonly eventsGateway: EventsGateway,
    private customVariables: CustomVariablesService,
    private s3: S3Service,
    private compliance: ComplianceService,
    private segments: SegmentsService,
    @InjectRepository(EmailDelivery)
    private deliveryRepo: Repository<EmailDelivery>,
  ) {}

  private readonly logger = new Logger(MailManagementService.name);

  /** Note what happened to one recipient. Never stops a send: the email itself matters more than the record. */
  private async record(scheduleId: number, email: string, status: DeliveryStatus, reason: string | null = null) {
    try {
      await this.deliveryRepo.upsert({ scheduleId, email, status, reason, at: new Date() }, ['scheduleId', 'email']);
    } catch (e) {
      this.logger.warn(`Could not record delivery for schedule ${scheduleId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  async deliveries(id: number, currentUser: User) {
    await this.getSchedule(id, currentUser); // access check
    return this.deliveryRepo.find({ where: { scheduleId: id }, order: { id: 'ASC' } });
  }

  /** Queue the same email again, now, for the recipients it failed for (not skipped ones), in the same batch. */
  async resendFailed(id: number, currentUser: User) {
    const s = await this.getSchedule(id, currentUser);
    const failed = (await this.deliveryRepo.find({ where: { scheduleId: id, status: 'failed' } })).map((d) => d.email);
    if (!failed.length) throw new BadRequestException('Nobody to resend to: no recipient failed.');
    const pick = <T>(m: Record<string, T> | null) => (m ? Object.fromEntries(failed.filter((e) => e in m).map((e) => [e, m[e]])) : null);
    const saved = await this.scheduleRepo.save(this.scheduleRepo.create({
      templateId: s.templateId,
      subject: s.subject,
      body: s.body,
      recipientEmails: failed,
      variables: s.variables,
      recipientVariables: pick(s.recipientVariables),
      attachments: s.attachments,
      recipientAttachments: pick(s.recipientAttachments),
      // Cc/Bcc already got a copy the first time
      scheduledAt: new Date(),
      status: 'pending',
      progress: 0,
      organizationId: s.organizationId,
      createdBy: currentUser.id,
      batchId: s.batchId ?? randomUUID(),
    }));
    if (!s.batchId) { s.batchId = saved.batchId; await this.scheduleRepo.save(s); }
    return { id: saved.id, queued: failed.length };
  }

  /** What a group send stores: the rules, resolved to people when it goes out. Needs an organization. */
  private segmentFor(dto: BulkSegmentDto | undefined, organizationId: number | null): ScheduleSegment | null {
    if (!dto) return null;
    if (organizationId == null) throw new BadRequestException('Sending to a group needs an organization');
    const fallbacks = Object.fromEntries(Object.entries(dto.fallbacks ?? {}).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()]));
    return {
      rules: dto.rules.map(({ field, op, values, days }) => ({ field, op, values, days })),
      excludeIds: dto.excludeIds ?? [],
      tzOffsetMinutes: dto.tzOffsetMinutes,
      fallbacks,
      label: dto.label?.trim() || null,
    };
  }

  /**
   * Add everyone the group matches right now to the schedule's recipients, each with their own values.
   * Explicit recipients already on the schedule keep theirs. Returns how many contacts matched.
   */
  private async resolveSegment(schedule: EmailSchedule): Promise<number> {
    const seg = schedule.segment!;
    const orgId = schedule.organizationId!;
    const [org, creator] = await Promise.all([
      this.organizationRepo.findOne({ where: { id: orgId } }),
      this.userRepo.findOne({ where: { id: schedule.createdBy }, select: ['id', 'name', 'email'] }),
    ]);
    const clients = await this.segments.resolve(orgId, seg.rules, localDay(seg.tzOffsetMinutes), seg.excludeIds);
    const custom = await this.customVariables.valuesForClients(orgId, clients.map((c) => c.id));
    const sender = { orgName: org?.name ?? '', userName: creator?.name ?? creator?.email ?? '', appUrl: firstFrontendUrl(process.env.FRONTEND_URL) };
    const emails = [...schedule.recipientEmails];
    const vars = { ...(schedule.recipientVariables ?? {}) };
    const seen = new Set(emails);
    for (const c of clients) {
      const email = c.email!.trim().toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      emails.push(email);
      // typed values < custom fields < the contact's own fields (later non-empty wins), as in the browser
      vars[email] = mergeVariables(seg.fallbacks, custom.get(c.id), clientVariables(c, org?.industry, sender));
    }
    schedule.recipientEmails = emails;
    schedule.recipientVariables = vars;
    schedule.segment = { ...seg, resolvedAt: new Date().toISOString(), matched: clients.length };
    return clients.length;
  }

  private emitMailStatus(schedule: EmailSchedule) {
    this.eventsGateway.emitToOrg(schedule.organizationId, 'mail.status', {
      id: schedule.id,
      status: schedule.status,
      sentAt: schedule.sentAt,
      errorMessage: schedule.errorMessage,
    });
  }

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
      while (cur <= to) { pushDate(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1); }
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
      while (cur <= to) { pushDate(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1); }
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
        if (targetDays.has(cur.getUTCDay())) pushDate(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      return slots;
    }

    return slots;
  }

  /** Get local date/time components from a UTC Date using a timezone offset string like "+05:30". Falls back to UTC. */
  private getLocalDate(d: Date, timeZoneOffset?: string): { year: number; month: number; day: number; hour: number; minute: number } {
    if (timeZoneOffset && /^[+-]\d{2}:?\d{2}$/.test(timeZoneOffset.replace(':', ''))) {
      const off = timeZoneOffset.replace(':', '');
      const sign = off[0] === '+' ? 1 : -1;
      const offsetH = parseInt(off.slice(1, 3), 10);
      const offsetM = parseInt(off.slice(3), 10);
      const offsetMs = sign * (offsetH * 60 + offsetM) * 60 * 1000;
      const local = new Date(d.getTime() + offsetMs);
      return {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
        hour: local.getUTCHours(),
        minute: local.getUTCMinutes(),
      };
    }
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    };
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

  /** Template sends: the template must exist and be usable by this user. Custom sends: subject + body required. */
  private async checkMessage(
    dto: { templateId?: number; subject?: string; body?: string },
    currentUser: User,
  ): Promise<EmailTemplate | null> {
    if (dto.templateId == null) {
      if (!dto.subject?.trim()) throw new BadRequestException('subject is required for custom scheduled emails');
      if (!dto.body?.trim()) throw new BadRequestException('body is required for custom scheduled emails');
      return null;
    }
    const templateRef = await this.templateRepo.findOne({ where: { id: dto.templateId } });
    if (!templateRef) throw new NotFoundException('Template not found');
    if (!this.canUseTemplateForSending(currentUser, templateRef)) {
      throw new ForbiddenException('You can only send using your allowed templates (master: global only; org: global or org templates)');
    }
    return templateRef;
  }

  /**
   * Queue one message to many recipients for immediate sending. The cron processor sends it
   * server-side, so the user can close the tab; it shows up in Scheduled Mails like any schedule.
   */
  async queueBulkSend(dto: SendBulkDto, currentUser: User): Promise<{ id: number; queued: number }> {
    checkCopyAddresses(dto.cc, dto.bcc);
    const templateRef = await this.checkMessage(dto, currentUser);

    const { recipientVariables, recipientAttachments, recipientEmails } = collectRecipients(dto.recipients ?? []);
    const isMaster = currentUser.role?.name === RoleName.MASTER_ADMIN;
    checkAttachmentRefs(dto.attachments ?? [], recipientAttachments, currentUser.organizationId, isMaster);
    const organizationId = isMaster ? (templateRef?.organizationId ?? null) : currentUser.organizationId;
    const segment = this.segmentFor(dto.segment, organizationId);
    if (!segment && !recipientEmails.length) throw new BadRequestException('Add at least one recipient');

    const saved = await this.scheduleRepo.save(
      this.scheduleRepo.create({
        templateId: dto.templateId ?? null,
        subject: dto.templateId == null ? dto.subject!.trim() : null,
        body: dto.templateId == null ? dto.body!.trim() : null,
        recipientEmails,
        recipientVariables,
        attachments: dto.attachments?.length ? dto.attachments : null,
        recipientAttachments: Object.keys(recipientAttachments).length ? recipientAttachments : null,
        variables: null,
        cc: dto.cc?.trim() || null,
        bcc: dto.bcc?.trim() || null,
        segment,
        batchId: randomUUID(),
        progress: 0,
        scheduledAt: new Date(),
        status: 'pending',
        organizationId,
        createdBy: currentUser.id,
      }),
    );
    // a group's size is only final when it goes out
    return { id: saved.id, queued: recipientEmails.length, ...(segment ? { segment: true } : {}) };
  }

  async createSchedule(dto: ScheduleEmailDto, currentUser: User): Promise<any> {
    checkCopyAddresses(dto.cc, dto.bcc);
    const templateRef = await this.checkMessage(dto, currentUser);

    // One call for many recipients: `recipients` carries each one's own variables
    let recipientVariables: Record<string, Record<string, string>> | null = null;
    let recipientAttachments: Record<string, AttachmentRef[]> = {};
    if (dto.recipients?.length) {
      const c = collectRecipients(dto.recipients);
      recipientVariables = c.recipientVariables;
      recipientAttachments = c.recipientAttachments;
      dto.recipientEmails = c.recipientEmails;
    }
    const hasFiles = !!dto.attachments?.length || Object.keys(recipientAttachments).length > 0;
    if (hasFiles && dto.schedule.type === 'monthly') {
      throw new BadRequestException('Attachments are not supported for monthly repeating emails yet. Use a one-off schedule or send now.');
    }
    checkAttachmentRefs(dto.attachments ?? [], recipientAttachments, currentUser.organizationId, currentUser.role?.name === RoleName.MASTER_ADMIN);
    if (dto.segment && dto.schedule.type === 'monthly') {
      throw new BadRequestException('Monthly repeating emails need a fixed list of recipients, not a group.');
    }
    if (!dto.recipientEmails?.length && !dto.segment) throw new BadRequestException('recipientEmails or recipients is required');

    if (dto.schedule.type === 'repeat') {
      const rule = dto.schedule.repeat;
      if (!rule) throw new BadRequestException('Say how often it repeats');
      const weekdays = rule.every === 'week' || rule.every === 'day' ? (rule.weekdays ?? []) : [];
      const days = rule.days ?? [];
      if ((rule.every === 'week' || rule.every === 'day') && !weekdays.length) throw new BadRequestException('Pick at least one day of the week');
      if (rule.every !== 'week' && rule.every !== 'day' && !days.length) throw new BadRequestException('Pick at least one day of the month');
      if (rule.endDate && rule.endDate < rule.startDate) throw new BadRequestException('The end date is before the start date');
      const validTimes = dto.schedule.times.filter((t) => t?.trim()).map((t) => t.trim());
      if (!validTimes.length) throw new BadRequestException('Add at least one send time');
      const organizationId = currentUser.role?.name === RoleName.MASTER_ADMIN
        ? (templateRef?.organizationId ?? null)
        : currentUser.organizationId;
      const saved = await this.recurringRepo.save(this.recurringRepo.create({
        templateId: dto.templateId ?? null,
        subject: dto.templateId == null ? dto.subject!.trim() : null,
        body: dto.templateId == null ? dto.body!.trim() : null,
        recipientEmails: [...new Set(dto.recipientEmails ?? [])],
        variables: dto.variables ?? null,
        recipientVariables,
        cc: dto.cc?.trim() || null,
        bcc: dto.bcc?.trim() || null,
        attachments: dto.attachments?.length ? dto.attachments : null,
        recipientAttachments: Object.keys(recipientAttachments).length ? recipientAttachments : null,
        segment: this.segmentFor(dto.segment, organizationId),
        frequency: rule.every,
        months: [...new Set(rule.months)].sort((a, b) => a - b),
        days: weekdays.length ? [] : [...new Set(days)],
        weekdays: weekdays.length ? [...new Set(weekdays)].sort() : null,
        startDate: rule.startDate,
        endDate: rule.endDate ?? null,
        maxSends: rule.count ?? null,
        times: validTimes,
        timeZoneOffset: dto.schedule.timeZoneOffset ?? null,
        batchId: randomUUID(),
        status: 'active' as const,
        organizationId,
        createdBy: currentUser.id,
      }));
      return { created: 1, type: 'recurring', id: saved.id };
    }

    // Monthly type creates an indefinitely recurring schedule
    if (dto.schedule.type === 'monthly') {
      const months = dto.schedule.monthlyMonths ?? [];
      const days = dto.schedule.monthlyDays ?? [];
      if (!months.length) throw new BadRequestException('Monthly schedule requires at least one month selected');
      if (!days.length) throw new BadRequestException('Monthly schedule requires at least one day of month selected');
      const validTimes = dto.schedule.times.filter((t) => t?.trim());
      if (!validTimes.length) throw new BadRequestException('Monthly schedule requires at least one send time');

      const organizationId = currentUser.role?.name === RoleName.MASTER_ADMIN
        ? (templateRef?.organizationId ?? null)
        : currentUser.organizationId;

      const base = {
        templateId: dto.templateId ?? null,
        subject: dto.templateId == null ? dto.subject!.trim() : null,
        body: dto.templateId == null ? dto.body!.trim() : null,
        months,
        days,
        times: validTimes,
        timeZoneOffset: dto.schedule.timeZoneOffset ?? null,
        batchId: randomUUID(),
        status: 'active' as const,
        organizationId,
        createdBy: currentUser.id,
      };
      // Recurring rows hold one shared `variables`; with per-recipient values, store one row per recipient
      // (saved together in one call). ponytail: N rows for N recipients; add a recipientVariables column if that grows.
      if (recipientVariables) {
        const rows = Object.entries(recipientVariables).map(([email, vars]) =>
          this.recurringRepo.create({ ...base, recipientEmails: [email], variables: { ...(dto.variables ?? {}), ...vars } }));
        const saved = await this.recurringRepo.save(rows);
        return { created: saved.length, type: 'recurring', id: saved[0].id, ids: saved.map((r) => r.id) };
      }
      const saved = await this.recurringRepo.save(
        this.recurringRepo.create({ ...base, recipientEmails: [...new Set(dto.recipientEmails)], variables: dto.variables ?? null }),
      );
      return { created: 1, type: 'recurring', id: saved.id };
    }

    const slots = this.expandScheduleToSlots(dto.schedule);
    if (!slots.length) throw new BadRequestException('Schedule produced no date/time slots. Check date range and times.');

    const organizationId = currentUser.role?.name === RoleName.MASTER_ADMIN
      ? (templateRef?.organizationId ?? null)
      : currentUser.organizationId;
    const createdBy = currentUser.id;
    const recipientEmails = [...new Set(dto.recipientEmails ?? [])];
    const segment = this.segmentFor(dto.segment, organizationId);

    const timeZoneOffset = dto.schedule.timeZoneOffset;
    const batchId = randomUUID();
    const schedules: EmailSchedule[] = [];
    for (const slot of slots) {
      const scheduledAt = this.slotToScheduledAt(slot.date, slot.time, timeZoneOffset);
      const schedule = this.scheduleRepo.create({
        templateId: dto.templateId ?? null,
        subject: dto.templateId == null ? dto.subject!.trim() : null,
        body: dto.templateId == null ? dto.body!.trim() : null,
        recipientEmails,
        variables: dto.variables ?? null,
        recipientVariables,
        attachments: dto.attachments?.length ? dto.attachments : null,
        recipientAttachments: Object.keys(recipientAttachments).length ? recipientAttachments : null,
        segment,
        cc: dto.cc?.trim() || null,
        bcc: dto.bcc?.trim() || null,
        scheduledAt,
        status: 'pending',
        organizationId,
        createdBy,
        batchId,
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
    dto: { scheduledAt?: string; recipientEmails?: string[]; variables?: Record<string, string>; subject?: string; body?: string },
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
    if (dto.subject != null && schedule.templateId == null) schedule.subject = dto.subject;
    if (dto.body != null && schedule.templateId == null) schedule.body = dto.body;
    return this.scheduleRepo.save(schedule);
  }

  /** Cancels a pending or in-progress email; one that already failed or was cancelled is removed from the list. */
  async cancelSchedule(id: number, currentUser: User): Promise<EmailSchedule | { deleted: true }> {
    const schedule = await this.getSchedule(id, currentUser);
    if (schedule.status === 'failed' || schedule.status === 'cancelled') {
      await this.scheduleRepo.remove(schedule);
      return { deleted: true };
    }
    // A bulk send in progress can be stopped too; the processor notices within 10 recipients
    if (schedule.status !== 'pending' && schedule.status !== 'sending') {
      throw new BadRequestException('Only pending or in-progress schedules can be cancelled');
    }
    schedule.status = 'cancelled';
    return this.scheduleRepo.save(schedule);
  }

  async updateRecurringSchedule(
    id: number,
    dto: { months?: number[]; days?: number[]; times?: string[]; recipientEmails?: string[] },
    currentUser: User,
  ): Promise<EmailRecurringSchedule> {
    const recurring = await this.recurringRepo.findOne({ where: { id } });
    if (!recurring) throw new NotFoundException('Recurring schedule not found');
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN) {
      if (recurring.organizationId !== currentUser.organizationId) throw new ForbiddenException('Access denied');
    }
    if (dto.months?.length) recurring.months = dto.months;
    if (dto.days?.length) recurring.days = dto.days;
    if (dto.times?.length) recurring.times = dto.times.filter((t) => t?.trim());
    if (dto.recipientEmails?.length) recurring.recipientEmails = [...new Set(dto.recipientEmails)];
    return this.recurringRepo.save(recurring);
  }

  async startRecurringSchedule(id: number, currentUser: User): Promise<EmailRecurringSchedule> {
    const recurring = await this.recurringRepo.findOne({ where: { id } });
    if (!recurring) throw new NotFoundException('Recurring schedule not found');
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN) {
      if (recurring.organizationId !== currentUser.organizationId) throw new ForbiddenException('Access denied');
    }
    if (recurring.status === 'active') throw new BadRequestException('Recurring schedule is already active');
    recurring.status = 'active';
    return this.recurringRepo.save(recurring);
  }

  async deleteRecurringSchedule(id: number, currentUser: User): Promise<void> {
    const recurring = await this.recurringRepo.findOne({ where: { id } });
    if (!recurring) throw new NotFoundException('Recurring schedule not found');
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN) {
      if (recurring.organizationId !== currentUser.organizationId) throw new ForbiddenException('Access denied');
    }
    await this.recurringRepo.remove(recurring);
  }

  async listRecurringSchedules(currentUser: User) {
    const qb = this.recurringRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.template', 't')
      .orderBy('r.id', 'DESC');
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN) {
      const orgId = currentUser.organizationId;
      if (!orgId) return [];
      qb.andWhere('r.organizationId = :orgId', { orgId });
    }
    return qb.getMany();
  }

  async stopRecurringSchedule(id: number, currentUser: User): Promise<EmailRecurringSchedule> {
    const recurring = await this.recurringRepo.findOne({ where: { id } });
    if (!recurring) throw new NotFoundException('Recurring schedule not found');
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN) {
      if (recurring.organizationId !== currentUser.organizationId) throw new ForbiddenException('Access denied');
    }
    if (recurring.status === 'stopped') throw new BadRequestException('Recurring schedule is already stopped');
    recurring.status = 'stopped';
    return this.recurringRepo.save(recurring);
  }

  private canUseTemplateForSending(user: User, template: EmailTemplate): boolean {
    if (user.role?.name === RoleName.MASTER_ADMIN) return template.organizationId == null;
    return template.organizationId == null || template.organizationId === user.organizationId;
  }

  private canAccessSchedule(user: User, schedule: EmailSchedule): boolean {
    if (user.role?.name === RoleName.MASTER_ADMIN) return true;
    return schedule.organizationId === user.organizationId;
  }

  /**
   * For each active recurring monthly schedule, check whether the current moment matches a
   * configured month+day+time slot and, if so, insert a pending EmailSchedule record.
   * Dedup: skips if a record already exists within ±60 s of the computed scheduledAt.
   */
  private async insertRecurringDueSlots(now: Date): Promise<void> {
    const activeRecurring = await this.recurringRepo.find({ where: { status: 'active' } });
    for (const recurring of activeRecurring) {
      const local = this.getLocalDate(now, recurring.timeZoneOffset ?? undefined);
      const today = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
      if (recurring.endDate && today > recurring.endDate) {
        recurring.status = 'ended';
        await this.recurringRepo.save(recurring);
        continue;
      }
      if (!firesOn(recurring, local.year, local.month, local.day)) continue;

      for (const timeStr of recurring.times) {
        const dateStr = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
        const scheduledAt = this.slotToScheduledAt(dateStr, timeStr, recurring.timeZoneOffset ?? undefined);

        // Only fire within a 2-minute window to compensate for cron startup lag
        const diffMs = now.getTime() - scheduledAt.getTime();
        if (diffMs < 0 || diffMs > 120_000) continue;

        // Dedup: skip if a record already exists for this recurring slot (±60 s window)
        const windowStart = new Date(scheduledAt.getTime() - 60_000);
        const windowEnd = new Date(scheduledAt.getTime() + 60_000);
        const existing = await this.scheduleRepo
          .createQueryBuilder('s')
          .where('s."recurringScheduleId" = :id', { id: recurring.id })
          .andWhere('s."scheduledAt" BETWEEN :start AND :end', { start: windowStart, end: windowEnd })
          .getOne();
        if (existing) continue;

        const record = this.scheduleRepo.create({
          templateId: recurring.templateId,
          subject: recurring.subject,
          body: recurring.body,
          recipientEmails: recurring.recipientEmails,
          variables: recurring.variables,
          recipientVariables: recurring.recipientVariables ?? null,
          cc: recurring.cc ?? null,
          bcc: recurring.bcc ?? null,
          attachments: recurring.attachments ?? null,
          recipientAttachments: recurring.recipientAttachments ?? null,
          // worked out again for this send
          segment: recurring.segment ? { ...recurring.segment, resolvedAt: undefined, matched: undefined } : null,
          scheduledAt,
          status: 'pending',
          organizationId: recurring.organizationId,
          createdBy: recurring.createdBy,
          recurringScheduleId: recurring.id,
          batchId: recurring.batchId,
        });
        await this.scheduleRepo.save(record);
        recurring.sentCount = (recurring.sentCount ?? 0) + 1;
        if (recurring.maxSends && recurring.sentCount >= recurring.maxSends) recurring.status = 'ended';
        await this.recurringRepo.save(recurring);
        if (recurring.status === 'ended') break;
      }
    }
  }

  /** {{login_email}}/{{login_password}} for a recipient who is a client of this org with a portal login. */
  async loginVariables(organizationId: number | null, email: string): Promise<Record<string, string>> {
    if (organizationId == null) return {};
    const client = await this.clientRepo
      .createQueryBuilder('c')
      .where('c.organizationId = :organizationId', { organizationId })
      .andWhere('LOWER(c.email) = LOWER(:email)', { email })
      .andWhere('c.userId IS NOT NULL')
      .getOne();
    if (!client?.userId) return {};
    const user = await this.userRepo.findOne({ where: { id: client.userId }, select: ['id', 'email', 'encryptedPlainPassword'] });
    if (!user) return {};
    const password = decryptPlainPassword(user.encryptedPlainPassword ?? undefined);
    return { login_email: user.email, ...(password ? { login_password: password } : {}) };
  }

  /** Pause between emails (SMTP rate limits). A method so tests can stub it. */
  pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Process pending schedules due now: send to each recipient with 2 sec delay. Called by cron. */
  async processDueSchedules(): Promise<{ processed: number; sent: number; failed: number }> {
    const now = new Date();

    // Materialise any recurring monthly slots that are due before fetching pending records
    await this.insertRecurringDueSlots(now);

    const pending = await this.scheduleRepo.find({
      where: { status: In(['pending', 'sending']), scheduledAt: LessThanOrEqual(now) },
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
        this.emitMailStatus(schedule);
        failed++;
        continue;
      }

      // Template email: needs a valid template
      if (!isCustom && !schedule.template) {
        schedule.status = 'failed';
        schedule.errorMessage = 'Template not found';
        await this.scheduleRepo.save(schedule);
        this.emitMailStatus(schedule);
        failed++;
        continue;
      }

      const variables = { ...(schedule.variables ?? {}) };
      let fromName: string | undefined;
      let identity: { replyTo: string | null; signature: string | null } | undefined;
      if (schedule.organizationId != null) {
        const org = await this.organizationRepo.findOne({ where: { id: schedule.organizationId } });
        variables.org_name = org?.name ?? '';
        identity = { replyTo: org?.mailReplyTo ?? null, signature: org?.mailSignature ?? null };
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

      // A group send: work out who's in it now (once; a resumed send keeps the list it started with)
      if (schedule.segment && !schedule.segment.resolvedAt && schedule.organizationId != null) {
        await this.resolveSegment(schedule);
        // A repeat to a group (e.g. "follow-up date is in 3 days", checked daily) often matches nobody: that's not a failure
        if (!schedule.recipientEmails.length && schedule.recurringScheduleId != null) {
          await this.scheduleRepo.remove(schedule);
          continue;
        }
        if (!schedule.recipientEmails.length) {
          schedule.status = 'failed';
          schedule.errorMessage = 'No contacts with an email address matched this group when it was sent';
          await this.scheduleRepo.save(schedule);
          this.emitMailStatus(schedule);
          failed++;
          continue;
        }
        await this.scheduleRepo.save(schedule);
      }

      let anySent = schedule.progress > 0; // a resumed send already delivered some
      let lastError: string | null = null;
      let stopped = false;
      schedule.status = 'sending';
      await this.scheduleRepo.save(schedule);
      this.emitMailStatus(schedule);
      const cc = schedule.cc ?? undefined;
      const bcc = schedule.bcc ?? undefined;
      const content = isCustom ? `${schedule.subject} ${schedule.body}` : `${schedule.template!.subject} ${schedule.template!.body}`;
      const used = usedVariables(content);
      const needsLogin = used.some((v) => v === 'login_email' || v === 'login_password');
      const needsCustom = used.some((v) => !RESERVED_KEYS.has(v));
      // Files every recipient gets are downloaded once per send; a recipient's own files per email
      const fileCache = new Map<string, Buffer>();
      const loadFiles = async (refs: AttachmentRef[], cache: boolean) => Promise.all(refs.map(async (a) => {
        let content = fileCache.get(a.key);
        if (!content) {
          content = await this.s3.download(a.key);
          if (cache) fileCache.set(a.key, content);
        }
        return { filename: a.name, content, contentType: a.contentType };
      }));
      // Unsubscribed and bounced addresses never get bulk mail (checked when sending, not when queued)
      const blocked = schedule.organizationId != null
        ? await this.compliance.suppressedAmong(schedule.organizationId, schedule.recipientEmails.slice(schedule.progress ?? 0))
        : new Map<string, string>();
      let skipped = 0;
      for (let i = schedule.progress ?? 0; i < schedule.recipientEmails.length; i++) {
        const to = schedule.recipientEmails[i];
        const block = blocked.get(to.trim().toLowerCase());
        if (block) { skipped++; schedule.progress = i + 1; await this.record(schedule.id, to, 'skipped', block); continue; }
        if (i > (schedule.progress ?? 0)) await this.pause(DELAY_BETWEEN_EMAILS_MS);
        const login = needsLogin ? await this.loginVariables(schedule.organizationId, to) : {};
        const custom = needsCustom ? await this.customVariables.valuesFor(schedule.organizationId, to) : {};
        // later non-empty wins: portal login / custom-variable lookups < the recipient's own values < org values
        const vars = mergeVariables(login, custom, schedule.recipientVariables?.[to] ?? {}, variables);
        try {
          const files = [
            ...(await loadFiles(schedule.attachments ?? [], true)),
            ...(await loadFiles(schedule.recipientAttachments?.[to] ?? [], false)),
          ];
          let ok: boolean;
          if (isCustom) {
            ok = await this.emailTemplatesService.sendCustomInternal(
              to,
              schedule.subject!,
              schedule.body!,
              vars,
              fromName,
              schedule.organizationId ?? undefined,
              cc,
              bcc,
              files,
              identity,
            );
          } else {
            ok = await this.emailTemplatesService.sendWithTemplateInternal(
              to,
              schedule.template!,
              vars,
              fromName,
              schedule.organizationId ?? undefined,
              cc,
              bcc,
              files,
              identity,
            );
          }
          if (ok) { sent++; anySent = true; await this.record(schedule.id, to, 'sent'); }
          else { lastError = 'The mail server did not accept it'; failed++; await this.record(schedule.id, to, 'failed', lastError); }
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          failed++;
          await this.record(schedule.id, to, 'failed', lastError);
        }
        schedule.progress = i + 1;
        // Every 10 recipients: stop if the user cancelled, else save progress so a restart resumes here
        if (schedule.progress % 10 === 0 && schedule.progress < schedule.recipientEmails.length) {
          const current = await this.scheduleRepo.findOne({ where: { id: schedule.id }, select: ['id', 'status'] });
          if (current?.status === 'cancelled') { stopped = true; break; }
          await this.scheduleRepo.save(schedule);
        }
      }
      if (stopped) {
        schedule.status = 'cancelled';
        schedule.errorMessage = `Stopped by user after ${schedule.progress} of ${schedule.recipientEmails.length}`;
        await this.scheduleRepo.save(schedule);
        this.emitMailStatus(schedule);
        continue;
      }
      schedule.status = anySent ? 'sent' : 'failed';
      schedule.sentAt = new Date();
      const skippedNote = skipped ? `Skipped ${skipped} unsubscribed or bounced address${skipped === 1 ? '' : 'es'}` : null;
      schedule.errorMessage = [lastError, skippedNote].filter(Boolean).join('. ') || null;
      await this.scheduleRepo.save(schedule);
      this.emitMailStatus(schedule);
    }
    return { processed: pending.length, sent, failed };
  }
}
