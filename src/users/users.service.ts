import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { Organization } from '../entities/organization.entity';
import { RoleName } from '../common/enums/role.enum';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
  ) {}

  async findAll(currentUser: User, organizationId?: string): Promise<Partial<User>[]> {
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      const parsed =
        organizationId != null && organizationId !== ''
          ? parseInt(organizationId, 10)
          : undefined;
      const where =
        parsed !== undefined && Number.isInteger(parsed) ? { organizationId: parsed } : {};
      const users = await this.userRepo.find({
        where,
        relations: ['role', 'organization'],
        select: ['id', 'email', 'name', 'phone', 'roleId', 'organizationId', 'createdAt'],
        order: { createdAt: 'DESC' },
      });
      return users;
    }
    if (currentUser.organizationId != null) {
      const parsed =
        organizationId != null && organizationId !== ''
          ? parseInt(organizationId, 10)
          : NaN;
      const orgId = Number.isInteger(parsed) ? parsed : currentUser.organizationId;
      if (orgId == null || orgId !== currentUser.organizationId) {
        throw new ForbiddenException('Access denied');
      }
      const users = await this.userRepo.find({
        where: { organizationId: orgId },
        relations: ['role', 'organization'],
        select: ['id', 'email', 'name', 'phone', 'roleId', 'organizationId', 'createdAt'],
        order: { createdAt: 'DESC' },
      });
      return users;
    }
    return [];
  }

  async findOne(id: number, currentUser: User): Promise<Partial<User>> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['role', 'organization'],
      select: ['id', 'email', 'name', 'phone', 'roleId', 'organizationId', 'createdAt'],
    });
    if (!user) throw new NotFoundException('User not found');
    if (currentUser.role?.name !== RoleName.MASTER_ADMIN && currentUser.organizationId !== user.organizationId) {
      throw new ForbiddenException('Access denied');
    }
    return user;
  }

  async createEmployee(dto: CreateEmployeeDto, currentUser: User): Promise<Partial<User>> {
    const email = dto.email.toLowerCase();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    let organizationId: number;
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      if (!dto.organizationId) throw new BadRequestException('organizationId is required when creating employee as master admin');
      const org = await this.orgRepo.findOne({ where: { id: dto.organizationId } });
      if (!org) throw new NotFoundException('Organization not found');
      organizationId = org.id;
    } else {
      if (!currentUser.organizationId) throw new ForbiddenException('You must belong to an organization to create employees');
      organizationId = currentUser.organizationId;
    }

    const role = await this.roleRepo.findOne({ where: { name: dto.roleName } });
    if (!role) throw new BadRequestException('Invalid role');
    const allowedRoles = [RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE];
    if (!allowedRoles.includes(dto.roleName as RoleName)) {
      throw new BadRequestException('roleName must be ORG_ADMIN, CAA, or ORG_EMPLOYEE');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email,
        passwordHash,
        name: dto.name,
        phone: dto.phone ?? null,
        roleId: role.id,
        organizationId,
      }),
    );
    const created = await this.userRepo.findOne({
      where: { id: user.id },
      relations: ['role', 'organization'],
      select: ['id', 'email', 'name', 'phone', 'roleId', 'organizationId', 'createdAt'],
    });
    return created!;
  }
}
