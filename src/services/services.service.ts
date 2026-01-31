import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Service } from '../entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private repo: Repository<Service>,
  ) {}

  async findAll(currentUser: User, organizationId?: string): Promise<Service[]> {
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
