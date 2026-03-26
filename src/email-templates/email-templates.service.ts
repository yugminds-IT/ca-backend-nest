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
import { TEMPLATE_VARIABLES } from './constants/template-variables';
import { EmailService } from '../email/email.service';

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
  getVariables(): { key: string; label: string }[] {
    return [...TEMPLATE_VARIABLES];
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

  async update(id: number, dto: UpdateEmailTemplateDto, currentUser: User): Promise<EmailTemplate> {
    const template = await this.findOne(id, currentUser);
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
    const template = await this.findOne(id, currentUser);
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
  ): Promise<{ sent: boolean }> {
    let fromName: string | undefined;
    let subject: string;
    let html: string;
    let text: string;

    const enriched = { ...variables };
    if (currentUser.organizationId != null) {
      const org = await this.organizationRepo.findOne({ where: { id: currentUser.organizationId } });
      enriched.org_name = org?.name ?? '';
      enriched.org_admin_name = currentUser.name ?? currentUser.email ?? '';
      fromName = currentUser.name ?? currentUser.email;
    }

    if (templateIdOrNull != null) {
      const template = await this.repo.findOne({ where: { id: templateIdOrNull } });
      if (!template) throw new NotFoundException('Template not found');
      if (!this.canAccess(currentUser, template)) throw new ForbiddenException('Access denied to this template');
      subject = this.substituteVariables(template.subject, enriched);
      const body = this.substituteVariables(template.body, enriched);
      html = this.toProfessionalHtml(subject, body);
      text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      if (!customSubject?.trim()) throw new BadRequestException('Subject is required for custom emails');
      if (!customBody?.trim()) throw new BadRequestException('Body is required for custom emails');
      subject = this.substituteVariables(customSubject.trim(), enriched);
      const body = this.substituteVariables(customBody.trim(), enriched);
      html = this.toProfessionalHtml(subject, body);
      text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const sent = await this.emailService.sendMail(to, subject, text, html, fromName);

    const now = new Date();
    await this.scheduleRepo.save(
      this.scheduleRepo.create({
        templateId: templateIdOrNull ?? null,
        subject: templateIdOrNull == null ? subject : null,
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

  /** Internal: send one email using template + variables (no user check). Used by schedule processor. */
  async sendWithTemplateInternal(
    to: string,
    template: EmailTemplate,
    variables: Record<string, string> = {},
    fromName?: string,
  ): Promise<boolean> {
    const subject = this.substituteVariables(template.subject, variables);
    const body = this.substituteVariables(template.body, variables);
    const html = this.toProfessionalHtml(subject, body);
    const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return this.emailService.sendMail(to, subject, text, html, fromName);
  }

  /** Replace {{key}} with values. Variables object uses keys without braces, e.g. client_name. */
  substituteVariables(content: string, variables: Record<string, string>): string {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = key.startsWith('{{') ? key : `{{${key}}}`;
      result = result.split(placeholder).join(value ?? '');
    }
    return result;
  }

  /** Strip editor-specific attributes (class, data-*) from HTML, or convert plain text to HTML. */
  private sanitizeBody(body: string): string {
    const hasHtml = /<[a-z][\s\S]*?>/i.test(body);
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
  toProfessionalHtml(subject: string, body: string): string {
    const escapedSubject = this.escapeHtml(subject);
    const sanitizedBody = this.sanitizeBody(body);
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
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private canAccess(user: User, template: EmailTemplate): boolean {
    if (user.role?.name === RoleName.MASTER_ADMIN) return true;
    if (template.organizationId == null) return true;
    return user.organizationId === template.organizationId;
  }
}
