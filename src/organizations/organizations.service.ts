import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private repo: Repository<Organization>,
  ) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'org';
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
    return this.repo.save(
      this.repo.create({
        ...dto,
        slug,
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
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN && currentUser.organizationId !== id) {
      throw new ForbiddenException('Access denied');
    }
    return org;
  }

  async update(id: number, dto: UpdateOrganizationDto, currentUser: User): Promise<Organization> {
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN && currentUser.organizationId !== id) {
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
}
