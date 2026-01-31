import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { EmailTemplate } from '../entities/email-template.entity';
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
      const qb = this.repo.createQueryBuilder('t').orderBy('t.category', 'ASC').addOrderBy('t.type', 'ASC');
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

  /** Substitute variables and send email. Variables: { client_name: 'John' } -> {{client_name}} replaced. Injects org_name and org_admin_name when user belongs to an org. */
  async sendWithTemplate(
    to: string,
    templateId: number,
    variables: Record<string, string> = {},
    currentUser: User,
  ): Promise<{ sent: boolean }> {
    const template = await this.repo.findOne({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Template not found');
    if (!this.canAccess(currentUser, template)) throw new ForbiddenException('Access denied to this template');

    const enriched = { ...variables };
    let fromName: string | undefined;
    if (currentUser.organizationId != null) {
      const org = await this.organizationRepo.findOne({ where: { id: currentUser.organizationId } });
      enriched.org_name = org?.name ?? '';
      enriched.org_admin_name = currentUser.name ?? currentUser.email ?? '';
      fromName = currentUser.name ?? currentUser.email;
    }

    const subject = this.substituteVariables(template.subject, enriched);
    const body = this.substituteVariables(template.body, enriched);
    const html = this.toProfessionalHtml(subject, body);
    const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const sent = await this.emailService.sendMail(to, subject, text, html, fromName);
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

  /** Wrap subject + body in a professional HTML email layout. Body is escaped then newlines → <br>. */
  toProfessionalHtml(subject: string, body: string): string {
    const escapedSubject = this.escapeHtml(subject);
    const bodyEscaped = this.escapeHtml(body).replace(/\n/g, '<br>');
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapedSubject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    .wrapper { width: 100%; background-color: #f1f5f9; padding: 32px 16px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header-bar { height: 4px; background-color: #2563eb; }
    .header { padding: 24px 28px 20px; background-color: #ffffff; border-bottom: 1px solid #e2e8f0; }
    .header-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 20px; font-weight: 600; color: #0f172a; margin: 0; letter-spacing: -0.02em; line-height: 1.3; }
    .content { padding: 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #334155; }
    .content p { margin: 0 0 1em; }
    .content p:last-child { margin-bottom: 0; }
    .content a { color: #2563eb; text-decoration: none; }
    .content a:hover { text-decoration: underline; }
    .footer { padding: 20px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
  <div class="wrapper" style="width:100%;background-color:#f1f5f9;padding:32px 16px;">
    <div class="container" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div class="header-bar" style="height:4px;background-color:#2563eb;"></div>
      <div class="header" style="padding:24px 28px 20px;background-color:#ffffff;border-bottom:1px solid #e2e8f0;">
        <h1 class="header-title" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:20px;font-weight:600;color:#0f172a;margin:0;letter-spacing:-0.02em;line-height:1.3;">${escapedSubject}</h1>
      </div>
      <div class="content" style="padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.65;color:#334155;">
        ${bodyEscaped}
      </div>
      <div class="footer" style="padding:20px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.5;text-align:center;">
        This is an automated message from your CA organization. Please do not reply directly to this email.
      </div>
    </div>
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
