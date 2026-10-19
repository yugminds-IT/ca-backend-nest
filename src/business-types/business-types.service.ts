import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { BusinessType } from '../entities/business-type.entity';
import { Organization } from '../entities/organization.entity';
import { CreateBusinessTypeDto } from './dto/create-business-type.dto';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Injectable()
export class BusinessTypesService {
  constructor(
    @InjectRepository(BusinessType)
    private repo: Repository<BusinessType>,
    @InjectRepository(Organization)
    private organizationRepo: Repository<Organization>,
  ) {}

  async findAll(currentUser: User, organizationId?: string): Promise<BusinessType[]> {
    const orgIdNum = organizationId != null ? parseInt(organizationId, 10) : currentUser.organizationId;

    let userIndustry = currentUser.organization?.industry || 'financial_services';
    if (orgIdNum != null && (!currentUser.organization || orgIdNum !== currentUser.organizationId)) {
      const org = await this.organizationRepo.findOne({ where: { id: orgIdNum } });
      if (org?.industry) userIndustry = org.industry;
    }

    const query = this.repo.createQueryBuilder('bt');
    if (orgIdNum != null && !Number.isNaN(orgIdNum)) {
      query.where('bt.organizationId = :orgIdNum', { orgIdNum })
           .orWhere('(bt.organizationId IS NULL AND bt.industry = :industry)', { industry: userIndustry });
    } else {
      query.where('bt.organizationId IS NULL AND bt.industry = :industry', { industry: userIndustry });
    }

    return query.orderBy('bt.name', 'ASC').getMany();
  }

  async createCustom(dto: CreateBusinessTypeDto, currentUser: User): Promise<BusinessType> {
    if (
      currentUser.role?.name !== RoleName.MASTER_ADMIN &&
      currentUser.role?.name !== RoleName.ORG_ADMIN &&
      currentUser.role?.name !== RoleName.CAA &&
      currentUser.role?.name !== RoleName.ORG_EMPLOYEE
    ) {
      throw new ForbiddenException('Access denied');
    }
    const orgId = dto.organizationId ?? currentUser.organizationId ?? null;
    if (currentUser.role?.name === RoleName.MASTER_ADMIN && dto.organizationId) {
      // master admin can set any org
    } else if (currentUser.role?.name !== RoleName.MASTER_ADMIN && orgId !== currentUser.organizationId) {
      throw new ForbiddenException('Cannot add business type for another organization');
    }
    return this.repo.save(this.repo.create({ name: dto.name, organizationId: orgId }));
  }
}
