import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Service } from '../entities/service.entity';
import { Organization } from '../entities/organization.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private repo: Repository<Service>,
    @InjectRepository(Organization)
    private organizationRepo: Repository<Organization>,
  ) {}

  async findAll(currentUser: User, organizationId?: string): Promise<Service[]> {
    const orgIdNum = organizationId != null ? parseInt(organizationId, 10) : currentUser.organizationId;

    let userIndustry = currentUser.organization?.industry || 'financial_services';
    if (orgIdNum != null && (!currentUser.organization || orgIdNum !== currentUser.organizationId)) {
      const org = await this.organizationRepo.findOne({ where: { id: orgIdNum } });
      if (org?.industry) userIndustry = org.industry;
    }

    const query = this.repo.createQueryBuilder('s');
    if (orgIdNum != null && !Number.isNaN(orgIdNum)) {
      query.where('s.organizationId = :orgIdNum', { orgIdNum })
           .orWhere('(s.organizationId IS NULL AND s.industry = :industry)', { industry: userIndustry });
    } else {
      query.where('s.organizationId IS NULL AND s.industry = :industry', { industry: userIndustry });
    }

    return query.orderBy('s.name', 'ASC').getMany();
  }

  async createCustom(dto: CreateServiceDto, currentUser: User): Promise<Service> {
    if (
      currentUser.role?.name !== RoleName.MASTER_ADMIN &&
      currentUser.role?.name !== RoleName.ORG_ADMIN &&
      currentUser.role?.name !== RoleName.CAA &&
      currentUser.role?.name !== RoleName.ORG_EMPLOYEE
    ) {
      throw new ForbiddenException('Access denied');
    }
    const orgId = dto.organizationId ?? currentUser.organizationId ?? null;
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN && orgId !== currentUser.organizationId) {
      throw new ForbiddenException('Cannot add service for another organization');
    }
    return this.repo.save(this.repo.create({ name: dto.name, organizationId: orgId }));
  }
}
