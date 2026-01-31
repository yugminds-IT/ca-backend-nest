import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Client } from '../entities/client.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { Organization } from '../entities/organization.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateClientWithLoginDto } from './dto/create-client-with-login.dto';
import { OnboardClientDto } from './dto/onboard-client.dto';
import { CreateDirectorDto, UpdateDirectorDto } from './dto/onboard-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { RoleName } from '../common/enums/role.enum';
import { Service } from '../entities/service.entity';
import { ClientDirector } from '../entities/client-director.entity';
import { encryptPlainPassword, decryptPlainPassword } from '../common/encryption';

/** Client with directors as plain array (no circular ref) for JSON response */
export type ClientResponse = Omit<Client, 'directors'> & {
  directors: Array<Record<string, unknown>>;
  login_email?: string;
  login_password?: string;
};

/** Client response when login credentials were set (one-time generated password) */
export type ClientResponseWithPassword = ClientResponse & { generatedPassword?: string };

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private repo: Repository<Client>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    @InjectRepository(Service)
    private serviceRepo: Repository<Service>,
    @InjectRepository(ClientDirector)
    private directorRepo: Repository<ClientDirector>,
  ) {}

  private generatePassword(length = 12): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) result += chars[bytes[i]! % chars.length];
    return result;
  }

  private canAccessOrg(currentUser: User, organizationId: number): boolean {
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) return true;
    return currentUser.organizationId === organizationId;
  }

  /** Build response with directors as plain array (no circular ref) so JSON includes directors */
  private toClientResponse(client: Client): ClientResponse {
    const directors = (client.directors ?? []).map((d) => ({
      id: d.id,
      clientId: d.clientId,
      directorName: d.directorName,
      email: d.email,
      phone: d.phone,
      designation: d.designation,
      din: d.din,
      pan: d.pan,
      aadharNumber: d.aadharNumber,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
    return { ...client, directors };
  }

  /** Load login_email and login_password (decrypted) for client's user when available. */
  private async getLoginCredentials(userId: number): Promise<{ login_email?: string; login_password?: string }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'encryptedPlainPassword'],
    });
    if (!user) return {};
    const login_password = decryptPlainPassword(user.encryptedPlainPassword ?? undefined);
    return {
      login_email: user.email,
      ...(login_password ? { login_password } : {}),
    };
  }

  async create(dto: CreateClientDto, currentUser: User): Promise<Client> {
    if (!this.canAccessOrg(currentUser, dto.organizationId)) {
      throw new ForbiddenException('Cannot create client for this organization');
    }
    return this.repo.save(this.repo.create(dto));
  }

  async createWithLogin(
    dto: CreateClientWithLoginDto,
    currentUser: User,
  ): Promise<{ client: Client; email: string; generatedPassword: string }> {
    const email = dto.email.toLowerCase();
    let organizationId: number;
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      if (!dto.organizationId) throw new BadRequestException('organizationId is required when creating client as master admin');
      const org = await this.orgRepo.findOne({ where: { id: dto.organizationId } });
      if (!org) throw new NotFoundException('Organization not found');
      organizationId = org.id;
    } else {
      if (!currentUser.organizationId) throw new ForbiddenException('You must belong to an organization to create clients');
      organizationId = currentUser.organizationId;
    }
    // Only conflict if this email already exists in the same organization
    const existingUser = await this.userRepo.findOne({ where: { email, organizationId } });
    if (existingUser) throw new ConflictException('A user with this email already exists in your organization');

    const role = await this.roleRepo.findOne({ where: { name: RoleName.CLIENT } });
    if (!role) throw new BadRequestException('CLIENT role not found');

    const generatedPassword = this.generatePassword(12);
    const passwordHash = await bcrypt.hash(generatedPassword, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email,
        passwordHash,
        name: dto.name ?? email.split('@')[0],
        phone: dto.phone ?? null,
        roleId: role.id,
        organizationId,
      }),
    );
    const encryptedPlain = encryptPlainPassword(generatedPassword);
    if (encryptedPlain) {
      user.encryptedPlainPassword = encryptedPlain;
      await this.userRepo.save(user);
    }
    const client = await this.repo.save(
      this.repo.create({
        organizationId,
        name: dto.name ?? email.split('@')[0],
        email,
        phone: dto.phone ?? null,
        userId: user.id,
      }),
    );
    const clientWithRelations = await this.repo.findOne({
      where: { id: client.id },
      relations: ['organization', 'user'],
    });
    if (!clientWithRelations) throw new NotFoundException('Client not found after create');
    return {
      client: clientWithRelations,
      email,
      generatedPassword,
    };
  }

  async onboard(dto: OnboardClientDto, currentUser: User): Promise<ClientResponse> {
    let organizationId: number;
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      if (!dto.organizationId) throw new BadRequestException('organizationId is required as master admin');
      const org = await this.orgRepo.findOne({ where: { id: dto.organizationId } });
      if (!org) throw new NotFoundException('Organization not found');
      organizationId = org.id;
    } else {
      if (!currentUser.organizationId) throw new ForbiddenException('You must belong to an organization');
      organizationId = currentUser.organizationId;
    }
    const email = dto.email.toLowerCase();
    const client = this.repo.create({
      organizationId,
      name: dto.name,
      email,
      phone: dto.phone ?? null,
      companyName: dto.companyName ?? null,
      businessTypeId: dto.businessTypeId ?? null,
      panNumber: dto.panNumber ?? null,
      gstNumber: dto.gstNumber ?? null,
      status: dto.status ?? 'active',
      address: dto.address ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      country: dto.country ?? null,
      pincode: dto.pincode ?? null,
      onboardDate: dto.onboardDate ? new Date(dto.onboardDate) : null,
      followupDate: dto.followupDate ? new Date(dto.followupDate) : null,
      additionalNotes: dto.additionalNotes ?? null,
    });
    const saved = await this.repo.save(client);
    if (dto.serviceIds?.length) {
      const services = await this.serviceRepo.findBy(dto.serviceIds.map((id) => ({ id })));
      saved.services = services;
      await this.repo.save(saved);
    }
    if (dto.directors?.length) {
      for (const dir of dto.directors) {
        if (!dir.directorName?.trim()) continue;
        await this.directorRepo.save(
          this.directorRepo.create({
            clientId: saved.id,
            directorName: dir.directorName.trim(),
            email: dir.email?.trim() || null,
            phone: dir.phone?.trim() || null,
            designation: dir.designation?.trim() || null,
            din: dir.din?.trim() || null,
            pan: dir.pan?.trim() || null,
            aadharNumber: dir.aadharNumber?.trim() || null,
          }),
        );
      }
    }
    const withRelations = await this.repo.findOne({
      where: { id: saved.id },
      relations: ['organization', 'businessType', 'services', 'user', 'directors'],
    });
    if (!withRelations) throw new NotFoundException('Client not found after onboard');
    return this.toClientResponse(withRelations);
  }

  async addDirector(clientId: number, dto: CreateDirectorDto, currentUser: User): Promise<ClientDirector> {
    const client = await this.findOne(clientId, currentUser);
    const director = this.directorRepo.create({
      clientId: client.id,
      directorName: dto.directorName,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      designation: dto.designation ?? null,
      din: dto.din ?? null,
      pan: dto.pan ?? null,
      aadharNumber: dto.aadharNumber ?? null,
    });
    return this.directorRepo.save(director);
  }

  async getDirectors(clientId: number, currentUser: User): Promise<ClientDirector[]> {
    await this.findOne(clientId, currentUser);
    return this.directorRepo.find({ where: { clientId }, order: { createdAt: 'ASC' } });
  }

  async updateDirector(
    clientId: number,
    directorId: number,
    dto: UpdateDirectorDto,
    currentUser: User,
  ): Promise<ClientDirector> {
    await this.findOne(clientId, currentUser);
    const director = await this.directorRepo.findOne({ where: { id: directorId, clientId } });
    if (!director) throw new NotFoundException('Director not found');
    Object.assign(director, dto);
    return this.directorRepo.save(director);
  }

  async removeDirector(clientId: number, directorId: number, currentUser: User): Promise<void> {
    await this.findOne(clientId, currentUser);
    const director = await this.directorRepo.findOne({ where: { id: directorId, clientId } });
    if (!director) throw new NotFoundException('Director not found');
    await this.directorRepo.remove(director);
  }

  /** Check if a user with this email already exists (email is globally unique in users table). */
  async checkLoginEmailExists(email: string, _organizationIdParam?: string, _currentUser?: User): Promise<{ exists: boolean }> {
    if (!email) return { exists: false };
    const normalized = email.toLowerCase().trim();
    const user = await this.userRepo.findOne({ where: { email: normalized } });
    return { exists: !!user };
  }

  async findAll(currentUser: User, organizationId?: string): Promise<ClientResponse[]> {
    let list: Client[];
    if (currentUser.role?.name === RoleName.MASTER_ADMIN) {
      const where = organizationId ? { organizationId: parseInt(organizationId, 10) } : {};
      list = await this.repo.find({
        where,
        relations: ['organization', 'user', 'businessType', 'services', 'directors'],
        order: { createdAt: 'DESC' },
      });
    } else {
      const orgIdNum = organizationId != null ? parseInt(organizationId, 10) : currentUser.organizationId;
      if (orgIdNum == null || Number.isNaN(orgIdNum)) return [];
      if (!this.canAccessOrg(currentUser, orgIdNum)) return [];
      list = await this.repo.find({
        where: { organizationId: orgIdNum },
        relations: ['organization', 'user', 'businessType', 'services', 'directors'],
        order: { createdAt: 'DESC' },
      });
    }
    return list.map((c) => this.toClientResponse(c));
  }

  async findOne(id: number, currentUser: User): Promise<Client> {
    const client = await this.repo.findOne({
      where: { id },
      relations: ['organization', 'user', 'businessType', 'services', 'directors'],
    });
    if (!client) throw new NotFoundException('Client not found');
    if (!this.canAccessOrg(currentUser, client.organizationId)) {
      throw new ForbiddenException('Access denied');
    }
    if (currentUser.role?.name === RoleName.CLIENT && currentUser.id !== client.userId) {
      throw new ForbiddenException('Access denied');
    }
    return client;
  }

  /** Same as findOne but returns serializable response with directors (no circular ref). Use for GET :id. */
  async findOneForResponse(id: number, currentUser: User): Promise<ClientResponse> {
    const client = await this.findOne(id, currentUser);
    const response = this.toClientResponse(client);
    if (client.userId) {
      const creds = await this.getLoginCredentials(client.userId);
      if (creds.login_email) response.login_email = creds.login_email;
      if (creds.login_password) response.login_password = creds.login_password;
    }
    return response;
  }

  async update(id: number, dto: UpdateClientDto, currentUser: User): Promise<ClientResponseWithPassword> {
    const client = await this.repo.findOne({
      where: { id },
      relations: ['organization', 'user', 'businessType', 'services', 'directors'],
    });
    if (!client) throw new NotFoundException('Client not found');
    if (!this.canAccessOrg(currentUser, client.organizationId)) {
      throw new ForbiddenException('Access denied');
    }
    if (currentUser.role?.name === RoleName.CLIENT && currentUser.id !== client.userId) {
      throw new ForbiddenException('Access denied');
    }
    if (
      currentUser.role?.name !== RoleName.MASTER_ADMIN &&
      currentUser.role?.name !== RoleName.ORG_ADMIN &&
      currentUser.role?.name !== RoleName.CAA &&
      currentUser.role?.name !== RoleName.ORG_EMPLOYEE
    ) {
      if (currentUser.role?.name === RoleName.CLIENT && client.userId !== currentUser.id) {
        throw new ForbiddenException('Access denied');
      }
    }
    const { serviceIds, onboardDate, followupDate, directors: directorsDto, login_email: loginEmail, login_password: loginPassword, remove_login: removeLogin, ...rest } = dto;
    Object.assign(client, rest);

    // Remove login: delete user and clear client.userId
    if (removeLogin === true && client.userId != null) {
      const user = await this.userRepo.findOne({ where: { id: client.userId } });
      if (user) {
        await this.userRepo.remove(user);
      }
      client.userId = null;
      await this.repo.save(client);
    }
    if (onboardDate !== undefined) client.onboardDate = onboardDate ? new Date(onboardDate) : null;
    if (followupDate !== undefined) client.followupDate = followupDate ? new Date(followupDate) : null;
    if (serviceIds !== undefined) {
      client.services = serviceIds.length
        ? await this.serviceRepo.findBy(serviceIds.map((id) => ({ id })))
        : [];
    }
    await this.repo.save(client);
    if (directorsDto !== undefined) {
      const existing = await this.directorRepo.find({ where: { clientId: client.id } });
      for (const dir of existing) {
        await this.directorRepo.remove(dir);
      }
      for (const dir of directorsDto) {
        if (!dir.directorName?.trim()) continue;
        await this.directorRepo.save(
          this.directorRepo.create({
            clientId: client.id,
            directorName: dir.directorName.trim(),
            email: dir.email?.trim() || null,
            phone: dir.phone?.trim() || null,
            designation: dir.designation?.trim() || null,
            din: dir.din?.trim() || null,
            pan: dir.pan?.trim() || null,
            aadharNumber: dir.aadharNumber?.trim() || null,
          }),
        );
      }
    }

    let generatedPassword: string | undefined;
    if (removeLogin !== true && loginEmail != null && loginEmail.trim() !== '') {
      const email = loginEmail.trim().toLowerCase();
      const role = await this.roleRepo.findOne({ where: { name: RoleName.CLIENT } });
      if (!role) throw new BadRequestException('CLIENT role not found');
      if (client.userId == null) {
        const existingInOrg = await this.userRepo.findOne({ where: { email, organizationId: client.organizationId } });
        if (existingInOrg) throw new ConflictException('A user with this email already exists in your organization');
        const existingGlobal = await this.userRepo.findOne({ where: { email } });
        if (existingGlobal) throw new ConflictException('A user with this email already exists. Use a different email.');
        const password = loginPassword?.trim() || this.generatePassword(12);
        if (!loginPassword?.trim()) generatedPassword = password;
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await this.userRepo.save(
          this.userRepo.create({
            email,
            passwordHash,
            name: client.name ?? email.split('@')[0],
            phone: client.phone ?? null,
            roleId: role.id,
            organizationId: client.organizationId,
          }),
        );
        const encryptedPlain = encryptPlainPassword(password);
        if (encryptedPlain) {
          user.encryptedPlainPassword = encryptedPlain;
          await this.userRepo.save(user);
        }
        client.userId = user.id;
        await this.repo.save(client);
      } else {
        const user = await this.userRepo.findOne({ where: { id: client.userId } });
        if (!user) throw new NotFoundException('User not found for client');
        const existingInOrg = await this.userRepo.findOne({ where: { email, organizationId: client.organizationId } });
        if (existingInOrg && existingInOrg.id !== user.id) throw new ConflictException('A user with this email already exists in your organization');
        const existingGlobal = await this.userRepo.findOne({ where: { email } });
        if (existingGlobal && existingGlobal.id !== user.id) throw new ConflictException('A user with this email already exists. Use a different email.');
        const password = loginPassword?.trim() || this.generatePassword(12);
        if (!loginPassword?.trim()) generatedPassword = password;
        const passwordHash = await bcrypt.hash(password, 10);
        user.email = email;
        user.passwordHash = passwordHash;
        user.name = client.name ?? user.name ?? email.split('@')[0];
        user.phone = client.phone ?? user.phone ?? null;
        const encryptedPlain = encryptPlainPassword(password);
        if (encryptedPlain) user.encryptedPlainPassword = encryptedPlain;
        await this.userRepo.save(user);
      }
    }

    // Refetch with relations so response includes correct businessType and directors
    const updated = await this.repo.findOne({
      where: { id: client.id },
      relations: ['organization', 'user', 'businessType', 'services', 'directors'],
    });
    if (!updated) throw new NotFoundException('Client not found after update');
    const response = this.toClientResponse(updated) as ClientResponseWithPassword;
    if (generatedPassword !== undefined) {
      response.generatedPassword = generatedPassword;
    }
    if (updated.userId) {
      const creds = await this.getLoginCredentials(updated.userId);
      if (creds.login_email) response.login_email = creds.login_email;
      if (creds.login_password) response.login_password = creds.login_password;
    }
    return response;
  }

  async remove(id: number, currentUser: User): Promise<void> {
    const client = await this.findOne(id, currentUser);
    if (
      currentUser.role?.name !== RoleName.MASTER_ADMIN &&
      currentUser.role?.name !== RoleName.ORG_ADMIN &&
      currentUser.role?.name !== RoleName.CAA &&
      currentUser.role?.name !== RoleName.ORG_EMPLOYEE
    ) {
      throw new ForbiddenException('Only org users can delete clients');
    }
    await this.repo.remove(client);
  }
}
