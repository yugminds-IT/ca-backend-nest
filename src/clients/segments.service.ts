import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { In, Repository } from 'typeorm';
import { Client } from '../entities/client.entity';
import { Segment } from '../entities/segment.entity';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { applySegmentRules, SegmentRule, SegmentRuleDto, SegmentRulesDto } from './segment-rules';

export class SegmentPreviewDto extends SegmentRulesDto {
  /** The sender's local date, YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  today: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Contacts unticked in the panel */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50000)
  @IsInt({ each: true })
  excludeIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Master admins only: which organization */
  @IsOptional()
  @IsInt()
  organizationId?: number;
}

export class SaveSegmentDto extends SegmentRulesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class UpdateSegmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SegmentRuleDto)
  rules?: SegmentRuleDto[];
}

/** A usable address (same shape the browser accepts); blank or malformed ones are left out */
const HAS_EMAIL = `TRIM(c.email) ~ '^[^[:space:]@<>,;]+@[^[:space:]@<>,;]+[.][^[:space:]@<>,;]+$'`;

@Injectable()
export class SegmentsService {
  constructor(
    @InjectRepository(Client) private clients: Repository<Client>,
    @InjectRepository(Segment) private segments: Repository<Segment>,
  ) {}

  private orgOf(user: User, organizationId?: number): number {
    if (user.role?.name === RoleName.MASTER_ADMIN) {
      if (organizationId == null) throw new BadRequestException('organizationId is required');
      return organizationId;
    }
    if (user.organizationId == null) throw new ForbiddenException('You must belong to an organization');
    return user.organizationId;
  }

  /** Clients of the org matching every rule, minus the ones left out. */
  private matching(orgId: number, rules: SegmentRule[], today: string, excludeIds: number[] = []) {
    const qb = this.clients.createQueryBuilder('c').where('c."organizationId" = :orgId', { orgId });
    applySegmentRules(qb, rules, orgId, today);
    if (excludeIds.length) qb.andWhere('c.id NOT IN (:...excludeIds)', { excludeIds });
    return qb;
  }

  /** Count and one page of a group, for the recipients panel. */
  async preview(user: User, dto: SegmentPreviewDto) {
    const orgId = this.orgOf(user, dto.organizationId);
    const qb = this.matching(orgId, dto.rules, dto.today, dto.excludeIds);
    if (dto.search?.trim()) {
      const q = `%${dto.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      qb.andWhere(`(c.name ILIKE :q OR c.email ILIKE :q OR c."companyName" ILIKE :q)`, { q });
    }
    const [total, withEmail, page] = await Promise.all([
      qb.clone().getCount(),
      qb.clone().andWhere(HAS_EMAIL).getCount(),
      qb.clone()
        .select(['c.id', 'c.name', 'c.email', 'c.companyName', 'c.tags'])
        .orderBy('c.name', 'ASC')
        .addOrderBy('c.id', 'ASC')
        .offset(dto.offset ?? 0)
        .limit(dto.limit ?? 50)
        .getMany(),
    ]);
    return { total, withEmail, clients: page };
  }

  /** Everyone a segment send goes to: matching clients that have an email, with what their values are built from. */
  async resolve(orgId: number, rules: SegmentRule[], today: string, excludeIds: number[] = []): Promise<Client[]> {
    const ids = (await this.matching(orgId, rules, today, excludeIds).andWhere(HAS_EMAIL).select('c.id', 'id').orderBy('c.id').getRawMany())
      .map((r) => Number(r.id));
    const out: Client[] = [];
    for (let i = 0; i < ids.length; i += 1000) {
      out.push(...(await this.clients.find({
        where: { id: In(ids.slice(i, i + 1000)) },
        relations: ['businessType', 'services', 'directors'],
        order: { id: 'ASC' },
      })));
    }
    return out;
  }

  list(user: User, organizationId?: number) {
    return this.segments.find({ where: { organizationId: this.orgOf(user, organizationId) }, order: { name: 'ASC' } });
  }

  async create(user: User, dto: SaveSegmentDto, organizationId?: number) {
    const orgId = this.orgOf(user, organizationId);
    return this.saveUnique(this.segments.create({ organizationId: orgId, name: dto.name.trim(), rules: dto.rules, createdBy: user.id }));
  }

  async update(user: User, id: number, dto: UpdateSegmentDto) {
    const seg = await this.own(user, id);
    if (dto.name !== undefined) seg.name = dto.name.trim();
    if (dto.rules !== undefined) seg.rules = dto.rules;
    return this.saveUnique(seg);
  }

  async remove(user: User, id: number) {
    await this.segments.remove(await this.own(user, id));
    return { deleted: true };
  }

  private async own(user: User, id: number) {
    const seg = await this.segments.findOne({ where: { id } });
    if (!seg || (user.role?.name !== RoleName.MASTER_ADMIN && seg.organizationId !== user.organizationId)) {
      throw new NotFoundException('Group not found');
    }
    return seg;
  }

  private async saveUnique(seg: Segment) {
    if (!seg.name) throw new BadRequestException('Give the group a name');
    const clash = await this.segments.findOne({ where: { organizationId: seg.organizationId, name: seg.name } });
    if (clash && clash.id !== seg.id) throw new ConflictException(`A group called "${seg.name}" already exists`);
    return this.segments.save(seg);
  }
}
