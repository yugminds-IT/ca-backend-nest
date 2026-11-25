import { Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { EmailDraft } from '../entities/email-draft.entity';
import { User } from '../entities/user.entity';

export class SaveDraftDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsObject()
  data: Record<string, unknown>;
}

export class UpdateDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

const MAX_DRAFTS = 50;
const MAX_DRAFT_BYTES = 2 * 1024 * 1024;

/** Each person's unsent emails. Nobody else sees them. */
@Injectable()
export class DraftsService {
  constructor(@InjectRepository(EmailDraft) private drafts: Repository<EmailDraft>) {}

  list(user: User) {
    return this.drafts.find({ where: { createdBy: user.id }, order: { updatedAt: 'DESC' }, take: MAX_DRAFTS });
  }

  async get(user: User, id: number) {
    const d = await this.drafts.findOne({ where: { id, createdBy: user.id } });
    if (!d) throw new NotFoundException('Draft not found');
    return d;
  }

  async create(user: User, dto: SaveDraftDto) {
    checkSize(dto.data);
    // ponytail: oldest drafts beyond 50 are dropped; a list page with paging if people keep more
    const extra = await this.drafts.find({ where: { createdBy: user.id }, order: { updatedAt: 'DESC' }, skip: MAX_DRAFTS - 1 });
    if (extra.length) await this.drafts.remove(extra);
    return this.drafts.save(this.drafts.create({
      organizationId: user.organizationId ?? null,
      createdBy: user.id,
      title: titleOf(dto.title),
      data: dto.data,
    }));
  }

  async update(user: User, id: number, dto: UpdateDraftDto) {
    const d = await this.get(user, id);
    if (dto.title !== undefined) d.title = titleOf(dto.title);
    if (dto.data !== undefined) { checkSize(dto.data); d.data = dto.data; }
    return this.drafts.save(d);
  }

  async remove(user: User, id: number) {
    await this.drafts.remove(await this.get(user, id));
    return { deleted: true };
  }
}

const titleOf = (t: string) => t.trim().slice(0, 200) || 'Untitled email';

function checkSize(data: unknown) {
  if (JSON.stringify(data).length > MAX_DRAFT_BYTES) throw new PayloadTooLargeException('This draft is too large to save (over 2 MB).');
}
