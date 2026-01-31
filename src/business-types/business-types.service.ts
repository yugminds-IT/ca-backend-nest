import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { BusinessType } from '../entities/business-type.entity';
import { CreateBusinessTypeDto } from './dto/create-business-type.dto';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Injectable()
export class BusinessTypesService {
  constructor(
    @InjectRepository(BusinessType)
    private repo: Repository<BusinessType>,
  ) {}

  async findAll(currentUser: User, organizationId?: string): Promise<BusinessType[]> {
    const orgIdNum = organizationId != null ? parseInt(organizationId, 10) : currentUser.organizationId;
    const where =
      orgIdNum != null && !Number.isNaN(orgIdNum)
        ? [{ organizationId: IsNull() }, { organizationId: orgIdNum }]
        : [{ organizationId: IsNull() }];
    return this.repo.find({
      where,
      order: { name: 'ASC' },
    });
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
