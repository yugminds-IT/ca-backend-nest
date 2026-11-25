import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { EmailTemplate } from '../entities/email-template.entity';
import { EmailSchedule } from '../entities/email-schedule.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { CreateEmailTemplateDto, validateTemplateType } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto, validateTemplateTypeForUpdate } from './dto/update-email-template.dto';
import { RoleName } from '../common/enums/role.enum';
import { TemplateCategory } from './constants/template-category.enum';
import { TEMPLATE_TYPES_BY_CATEGORY } from './constants/template-type.enum';
import { TEMPLATE_VARIABLES, TemplateVariable } from './constants/template-variables';
import { EmailService } from '../email/email.service';
import { CustomVariablesService } from '../custom-variables/custom-variables.service';
import { escapeHtml, isHtmlBody, mergeVariables, renderEmail, systemVariables, withSignature, type MailIdentity } from './template-render';

type MailAttachment = { filename: string; content: Buffer; contentType?: string };

@Injectable()
export class EmailTemplatesService {
  constructor(
    @InjectRepository(EmailTemplate)
    private repo: Repository<EmailTemplate>,
    @InjectRepository(EmailSchedule)
    private scheduleRepo: Repository<EmailSchedule>,
    @InjectRepository(Organization)
    private organizationRepo: Repository<Organization>,
    private emailService: EmailService,
    private customVariables: CustomVariablesService,
  ) {}

  /** Dropdown: categories with labels */
  getCategories(): { value: string; label: string }[] {
    const labels: Record<string, string> = {
      service: 'Service Template',
      login: 'Login Template',
      notification: 'Notification Template',
      follow_up: 'Follow-up Template',
      reminder: 'Reminder Template',
    };
    return Object.entries(labels).map(([value, label]) => ({ value, label }));
  }

  /** Dropdown: types by category */
  getTypesByCategory(category: string): { value: string; label: string }[] {
    const types = (TEMPLATE_TYPES_BY_CATEGORY as Record<string, Record<string, string>>)[category];
    if (!types) return [];
    return Object.entries(types).map(([value, label]) => ({ value, label }));
  }

  /** Dropdown: available variables */
  getVariables(): TemplateVariable[] {
    return [...TEMPLATE_VARIABLES];
  }

  /** Server-known values (dates, FY, portal URL). Caller-supplied non-empty values override them. */
  systemVariables(): Record<string, string> {
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:3000';
    return systemVariables(new Date(), frontendUrl, process.env.APP_TIMEZONE || 'Asia/Kolkata');
  }

  /** Substitute variables (escaping values for HTML bodies, blanking unknown ones) and build the email. */
  private render(subject: string, body: string, variables: Record<string, string>) {
    const r = renderEmail(subject, body, mergeVariables(this.systemVariables(), variables));
    return { subject: r.subject, html: this.toProfessionalHtml(r.subject, r.body, r.isHtml), text: r.text };
  }

  async create(dto: CreateEmailTemplateDto, currentUser: User): Promise<EmailTemplate> {
    if (!validateTemplateType(dto.category, dto.type)) {
      throw new BadRequestException(`Invalid type '${dto.type}' for category '${dto.category}'`);
    }
    let organizationId: number | null = null;
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      organizationId = dto.organizationId ?? null;
    } else {
      if (currentUser.organizationId == null) {
        throw new ForbiddenException('You must belong to an organization to create templates');
      }
      organizationId = currentUser.organizationId;
    }
    const template = this.repo.create({
      category: dto.category,
      type: dto.type,
      name: dto.name ?? null,
      subject: dto.subject,
      body: dto.body,
      organizationId,
    });
    return this.repo.save(template);
  }

  async findAll(currentUser: User, category?: string, organizationId?: number): Promise<EmailTemplate[]> {
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      const qb = this.repo
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.organization', 'org')
        .orderBy('t.category', 'ASC')
        .addOrderBy('t.type', 'ASC');
      if (category) qb.andWhere('t.category = :category', { category });
      if (organizationId != null) qb.andWhere('t.organizationId = :organizationId', { organizationId });
      return qb.getMany();
    }
    const orgId = currentUser.organizationId;
    // When org user has no organizationId, return global templates so they still see templates
    const qb = this.repo
      .createQueryBuilder('t')
      .where(orgId != null ? '(t.organizationId IS NULL OR t.organizationId = :orgId)' : 't.organizationId IS NULL', orgId != null ? { orgId } : {})
      .orderBy('t.category', 'ASC')
      .addOrderBy('t.type', 'ASC');
    if (category) qb.andWhere('t.category = :category', { category });
    return qb.getMany();
  }

  /** Templates available for sending: master = only global (own); org = global + org's own */
  async findAllForSending(currentUser: User): Promise<EmailTemplate[]> {
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      return this.repo.find({
        where: { organizationId: IsNull() },
        order: { category: 'ASC', type: 'ASC' },
      });
    }
    const orgId = currentUser.organizationId;
    if (orgId == null) {
      return this.repo.find({
        where: { organizationId: IsNull() },
        order: { category: 'ASC', type: 'ASC' },
      });
    }
    return this.repo
      .createQueryBuilder('t')
      .where('(t.organizationId IS NULL OR t.organizationId = :orgId)', { orgId })
      .orderBy('t.category', 'ASC')
      .addOrderBy('t.type', 'ASC')
      .getMany();
  }

  async findOne(id: number, currentUser: User): Promise<EmailTemplate> {
    const template = await this.repo.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (!this.canAccess(currentUser, template)) throw new ForbiddenException('Access denied');
    return template;
  }

  /** Like findOne, but only for templates the user may change (shared master templates are read-only for orgs). */
  private async findModifiable(id: number, currentUser: User): Promise<EmailTemplate> {
    const template = await this.findOne(id, currentUser);
    if (!this.canModify(currentUser, template)) throw new ForbiddenException('Shared templates cannot be modified');
    return template;
  }

  async update(id: number, dto: UpdateEmailTemplateDto, currentUser: User): Promise<EmailTemplate> {
    const template = await this.findModifiable(id, currentUser);
    if (dto.category != null && dto.type != null && !validateTemplateTypeForUpdate(dto.category, dto.type)) {
      throw new BadRequestException(`Invalid type '${dto.type}' for category '${dto.category}'`);
    }
    if (dto.category != null) template.category = dto.category;
    if (dto.type != null) template.type = dto.type;
    if (dto.name !== undefined) template.name = dto.name;
    if (dto.subject != null) template.subject = dto.subject;
    if (dto.body != null) template.body = dto.body;
    return this.repo.save(template);
  }

  async remove(id: number, currentUser: User): Promise<void> {
    const template = await this.findModifiable(id, currentUser);
    await this.repo.remove(template);
  }

  /** Substitute variables and send email. Supports template-based or custom (subject+body) sending. */
  async sendWithTemplate(
    to: string,
    templateIdOrNull: number | undefined | null,
    variables: Record<string, string> = {},
    currentUser: User,
    customSubject?: string,
    customBody?: string,
    cc?: string,
    bcc?: string,
  ): Promise<{ sent: boolean }> {
    let fromName: string | undefined;
    let subject: string;
    let html: string;
    let text: string;

    // org's custom variables (default / this client's value) < values sent by the caller < org values below
    const enriched = mergeVariables(await this.customVariables.valuesFor(currentUser.organizationId, to), variables);
    if (currentUser.organizationId != null) {
      const org = await this.organizationRepo.findOne({ where: { id: currentUser.organizationId } });
      enriched.org_name = org?.name ?? '';
      enriched.org_admin_name = currentUser.name ?? currentUser.email ?? '';
      enriched.org_email = currentUser.email ?? '';
      enriched.org_phone = currentUser.phone ?? '';
      fromName = currentUser.name ?? currentUser.email;
    }

    if (templateIdOrNull != null) {
      const template = await this.repo.findOne({ where: { id: templateIdOrNull } });
      if (!template) throw new NotFoundException('Template not found');
      if (!this.canAccess(currentUser, template)) throw new ForbiddenException('Access denied to this template');
      ({ subject, html, text } = this.render(template.subject, template.body, enriched));
    } else {
      if (!customSubject?.trim()) throw new BadRequestException('Subject is required for custom emails');
      if (!customBody?.trim()) throw new BadRequestException('Body is required for custom emails');
      ({ subject, html, text } = this.render(customSubject.trim(), customBody.trim(), enriched));
    }

    const sent = await this.emailService.sendMail(
      to,
      subject,
      text,
      html,
      fromName,
      currentUser.organizationId ?? undefined,
      cc,
      bcc,
    );

    const now = new Date();
    await this.scheduleRepo.save(
      this.scheduleRepo.create({
        templateId: templateIdOrNull ?? null,
        subject: templateIdOrNull == null ? subject : null,
        body: templateIdOrNull == null ? (customBody?.trim() ?? null) : null,
        recipientEmails: [to],
        variables: Object.keys(enriched).length > 0 ? enriched : null,
        scheduledAt: now,
        status: sent ? 'sent' : 'failed',
        organizationId: currentUser.organizationId ?? null,
        createdBy: currentUser.id,
        sentAt: sent ? now : null,
      }),
    );

    return { sent };
  }

  /** Internal: send one custom (no template) email with variable substitution. Used by schedule processor. */
  async sendCustomInternal(
    to: string,
    subject: string,
    body: string,
    variables: Record<string, string> = {},
    fromName?: string,
    orgId?: number,
    cc?: string,
    bcc?: string,
    attachments?: MailAttachment[],
    identity?: MailIdentity,
  ): Promise<boolean> {
    const r = this.render(subject, withSignature(body, identity?.signature), variables);
    return this.emailService.sendMail(to, r.subject, r.text, r.html, fromName, orgId, cc, bcc, attachments, identity?.replyTo);
  }

  /** Internal: send one email using template + variables (no user check). Used by schedule processor. */
  async sendWithTemplateInternal(
    to: string,
    template: EmailTemplate,
    variables: Record<string, string> = {},
    fromName?: string,
    orgId?: number,
    cc?: string,
    bcc?: string,
    attachments?: MailAttachment[],
    identity?: MailIdentity,
  ): Promise<boolean> {
    const r = this.render(template.subject, withSignature(template.body, identity?.signature), variables);
    return this.emailService.sendMail(to, r.subject, r.text, r.html, fromName, orgId, cc, bcc, attachments, identity?.replyTo);
  }

  /** Strip editor-specific attributes (class, data-*) from HTML, or convert plain text to HTML. */
  private sanitizeBody(body: string, hasHtml = isHtmlBody(body)): string {
    if (!hasHtml) {
      // Plain text: double newline = new paragraph, single newline = <br>
      const paragraphs = body.split(/\n\n+/);
      return paragraphs
        .filter((p) => p.trim())
        .map((p) => {
          const lines = p.split('\n').map((l) => this.escapeHtml(l)).join('<br>');
          return `<p style="margin:0 0 1em;">${lines}</p>`;
        })
        .join('');
    }
    // HTML from editor: strip class/data-* attributes and normalize div → p
    return body
      .replace(/\s+class="[^"]*"/g, '')
      .replace(/\s+class='[^']*'/g, '')
      .replace(/\s+data-[a-z-]+=(?:"[^"]*"|'[^']*'|\S+)/g, '')
      .replace(/<div><br\s*\/?><\/div>/gi, '<br>')
      .replace(/<div>([\s\S]*?)<\/div>/gi, '<p>$1</p>');
  }

  /** Wrap body in a clean HTML email layout — no decorative header, no blue bar, no box. */
  toProfessionalHtml(subject: string, body: string, hasHtml?: boolean): string {
    const escapedSubject = this.escapeHtml(subject);
    const sanitizedBody = this.sanitizeBody(body, hasHtml);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapedSubject}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1a1a1a; background-color: #ffffff; -webkit-text-size-adjust: 100%; }
    p { margin: 0 0 1em; }
    p:last-child { margin-bottom: 0; }
    a { color: #1a1a1a; text-decoration: underline; }
    ol, ul { margin: 0 0 1em; padding-left: 1.5em; }
    li { margin-bottom: 0.25em; }
  </style>
</head>
<body>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;">
    ${sanitizedBody}
  </div>
</body>
</html>`.trim();
  }

  private escapeHtml(s: string): string {
    return escapeHtml(s);
  }

  private canAccess(user: User, template: EmailTemplate): boolean {
    if (user.role?.name === RoleName.MASTER_ADMIN) return true;
    if (template.organizationId == null) return true;
    return user.organizationId === template.organizationId;
  }
  private canModify(user: User, template: EmailTemplate): boolean {
    if (user.role?.name === RoleName.MASTER_ADMIN) return true;
    return template.organizationId != null && user.organizationId === template.organizationId;
  }
}
