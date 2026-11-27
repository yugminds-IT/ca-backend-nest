import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Form } from '../entities/form.entity';
import { ApiKey } from '../entities/api-key.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { BusinessUnitsService } from '../business-units/business-units.service';
import { DeveloperService } from '../developer/developer.service';
import { AccessService } from '../access/access.service';
import { SendFormSubmissionDto } from '../developer/dto/developer.dto';
import {
  assertRecordInOrg,
  denyClients,
  requireOrgScope,
} from '../leads/lead-scope.util';
import {
  FormField,
  toIntakeDto,
  validateFormDefinition,
  validateFormValues,
} from './form-rules';
import { CreateFormDto, UpdateFormDto } from './dto/form.dto';

const DEFAULT_SUCCESS = 'Thank you! We have received your details.';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

@Injectable()
export class FormsService {
  constructor(
    @InjectRepository(Form) private readonly forms: Repository<Form>,
    @InjectRepository(ApiKey) private readonly apiKeys: Repository<ApiKey>,
    @InjectRepository(Organization)
    private readonly orgs: Repository<Organization>,
    private readonly businessUnits: BusinessUnitsService,
    private readonly developer: DeveloperService,
    private readonly access: AccessService,
  ) {}

  async list(user: User, businessUnitId?: number) {
    const orgId = requireOrgScope(user);
    const limit = await this.access.brandLimitFor(user);
    if (businessUnitId && limit && !limit.includes(businessUnitId)) return [];
    const rows = await this.forms.find({
      where: businessUnitId
        ? { organizationId: orgId, businessUnitId }
        : limit
          ? { organizationId: orgId, businessUnitId: In(limit) }
          : { organizationId: orgId },
      order: { createdAt: 'DESC' },
    });
    const keys = rows.length
      ? await this.apiKeys.find({
          where: { id: In(rows.map((r) => r.apiKeyId)) },
        })
      : [];
    return rows.map((r) =>
      this.view(
        r,
        keys.find((k) => k.id === r.apiKeyId),
      ),
    );
  }

  async create(user: User, dto: CreateFormDto) {
    const orgId = requireOrgScope(user, dto.organizationId);
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const fields = this.cleanFields(dto.fields);
    const unitId = await this.businessUnits.resolveUnitId(
      orgId,
      dto.businessUnitId,
    );
    await this.access.assertBrand(user, unitId, 'Business unit');

    // Each form gets its own public key, so its submissions use the same intake rules as any key.
    const token = `pk_live_${randomBytes(16).toString('hex')}`;
    const key = await this.apiKeys.save(
      this.apiKeys.create({
        organizationId: orgId,
        businessUnitId: unitId,
        name: `Form: ${dto.name}`.slice(0, 150),
        keyType: 'public',
        keyPrefix: `${token.slice(0, 12)}...`,
        publicKey: token,
        allowedDomains: [],
        autoCreateLead: dto.autoCreateLead ?? false,
        rateLimitPerMinute: 60,
        isActive: true,
      }),
    );

    const base = slugify(dto.name) || 'form';
    const form = await this.forms.save(
      this.forms.create({
        organizationId: orgId,
        businessUnitId: unitId,
        apiKeyId: key.id,
        name: dto.name.trim(),
        slug: `${base}-${randomBytes(3).toString('hex')}`,
        fields,
        submitLabel: dto.submitLabel?.trim() || 'Send',
        successMessage: dto.successMessage?.trim() || DEFAULT_SUCCESS,
        status: 'active',
      }),
    );
    return this.view(form, key);
  }

  async update(user: User, id: number, dto: UpdateFormDto) {
    denyClients(user);
    const form = await this.forms.findOne({ where: { id } });
    if (!form) throw new NotFoundException('Form not found');
    assertRecordInOrg(user, form.organizationId);
    await this.access.assertBrand(user, form.businessUnitId, 'Form');

    let key = await this.apiKeys.findOne({ where: { id: form.apiKeyId } });
    if (!key) throw new NotFoundException('Form key not found');

    if (dto.fields !== undefined) form.fields = this.cleanFields(dto.fields);
    if (dto.name !== undefined) {
      form.name = dto.name.trim();
      key.name = `Form: ${form.name}`.slice(0, 150);
    }
    if (dto.submitLabel !== undefined) {
      form.submitLabel = dto.submitLabel.trim() || 'Send';
    }
    if (dto.successMessage !== undefined) {
      form.successMessage = dto.successMessage.trim() || DEFAULT_SUCCESS;
    }
    if (dto.status !== undefined) form.status = dto.status;
    if (dto.businessUnitId !== undefined) {
      const unitId = await this.businessUnits.resolveUnitId(
        form.organizationId,
        dto.businessUnitId,
      );
      await this.access.assertBrand(user, unitId, 'Business unit');
      form.businessUnitId = unitId;
      key.businessUnitId = unitId;
    }
    if (dto.autoCreateLead !== undefined) key.autoCreateLead = dto.autoCreateLead;

    await this.apiKeys.save(key);
    const saved = await this.forms.save(form);
    return this.view(saved, key);
  }

  /** Public: what the hosted page or the embed needs to draw the form. No internal ids. */
  async getPublic(slug: string) {
    const form = await this.forms.findOne({ where: { slug } });
    if (!form || form.status !== 'active') {
      throw new NotFoundException('This form is not available.');
    }
    const org = await this.orgs.findOne({ where: { id: form.organizationId } });
    return {
      name: form.name,
      submitLabel: form.submitLabel,
      successMessage: form.successMessage,
      organizationName: org?.name ?? null,
      fields: form.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options ?? [],
        placeholder: f.placeholder ?? '',
      })),
    };
  }

  /**
   * Public: a visitor submits the form. The form's own rules are checked here (required fields,
   * formats), then the submission goes through the same storage path as every other intake.
   */
  async submit(
    slug: string,
    body: Record<string, unknown>,
    meta: { origin?: string; referer?: string; ip?: string },
  ) {
    const payload = body ?? {};
    // Bots: silently accept, as the key-based path does.
    if (payload._honey || payload._gotcha) {
      return { success: true, message: 'Message received' };
    }
    await this.developer.verifyBotChecks(
      payload as SendFormSubmissionDto,
      meta.ip,
    );

    const form = await this.forms.findOne({ where: { slug, status: 'active' } });
    if (!form) throw new NotFoundException('This form is not available.');

    const { values, errors } = validateFormValues(form.fields, payload);
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Please check the highlighted fields.',
        errors,
      });
    }

    const key = await this.apiKeys.findOne({
      where: { id: form.apiKeyId, isActive: true },
      relations: ['organization'],
    });
    if (!key?.organization) {
      throw new NotFoundException('This form is not available.');
    }

    return this.developer.recordSubmission(
      key.organization,
      key,
      toIntakeDto(form.name, form.fields, values) as SendFormSubmissionDto,
      meta,
    );
  }

  private cleanFields(input: CreateFormDto['fields']): FormField[] {
    const fields: FormField[] = input.map((f) => ({
      key: f.key,
      label: f.label.trim(),
      type: f.type as FormField['type'],
      required: f.required,
      options:
        f.type === 'select'
          ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
          : undefined,
      placeholder: f.placeholder?.trim() || undefined,
      role: f.role ?? null,
    }));
    const problems = validateFormDefinition(fields);
    if (problems.length > 0) {
      throw new BadRequestException(problems.join('. '));
    }
    return fields;
  }

  private view(form: Form, key: ApiKey | undefined) {
    return {
      id: form.id,
      name: form.name,
      slug: form.slug,
      path: `/f/${form.slug}`,
      status: form.status,
      businessUnitId: form.businessUnitId,
      fields: form.fields,
      submitLabel: form.submitLabel,
      successMessage: form.successMessage,
      autoCreateLead: Boolean(key?.autoCreateLead),
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    };
  }
}
