import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { Organization } from '../entities/organization.entity';
import { Otp } from '../entities/otp.entity';
import { EmailService } from '../email/email.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { MasterAdminSignupDto } from './dto/master-admin-signup.dto';
import { OrganizationSignupDto } from './dto/organization-signup.dto';
import { OrgAdminSignupDto } from './dto/org-admin-signup.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { RoleName } from '../common/enums/role.enum';

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
    @InjectRepository(Otp)
    private otpRepo: Repository<Otp>,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
      relations: ['role', 'organization'],
      select: ['id', 'email', 'passwordHash', 'roleId', 'organizationId', 'createdAt'],
    });
    if (!user) throw new UnauthorizedException('Invalid email or password');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');
    return this.buildTokenResponse(user);
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const role = await this.roleRepo.findOne({ where: { name: dto.roleName } });
    if (!role) throw new BadRequestException('Invalid role');
    const orgRoles = [RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE, RoleName.CLIENT];
    if (orgRoles.includes(dto.roleName as RoleName) && !dto.organizationId) {
      throw new BadRequestException('organizationId required for this role');
    }
    if (dto.roleName === RoleName.MASTER_ADMIN && dto.organizationId) {
      throw new BadRequestException('Master admin must not have organizationId');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email,
        passwordHash,
        roleId: role.id,
        organizationId: dto.organizationId ?? null,
      }),
    );
    const withRelations = await this.userRepo.findOne({
      where: { id: user.id },
      relations: ['role', 'organization'],
    }) as User;
    return this.buildTokenResponse(withRelations!);
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.SECRET_KEY,
        algorithms: [(process.env.ALGORITHM ?? 'HS256') as 'HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      relations: ['role', 'organization'],
    });
    if (!user) throw new UnauthorizedException('User not found');
    return this.buildTokenResponse(user);
  }

  async signupMasterAdmin(dto: MasterAdminSignupDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const role = await this.roleRepo.findOne({ where: { name: RoleName.MASTER_ADMIN } });
    if (!role) throw new BadRequestException('Master admin role not found');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email,
        passwordHash,
        roleId: role.id,
        organizationId: null,
      }),
    );
    const withRelations = await this.userRepo.findOne({
      where: { id: user.id },
      relations: ['role', 'organization'],
    }) as User;
    return this.buildTokenResponse(withRelations!);
  }

  async signupOrganization(dto: OrganizationSignupDto) {
    const email = dto.admin.email.toLowerCase();
    const existingUser = await this.userRepo.findOne({ where: { email } });
    if (existingUser) throw new ConflictException('Email already registered');
    const slug = this.slugify(dto.organization.name);
    let baseSlug = slug;
    let counter = 0;
    while (await this.orgRepo.findOne({ where: { slug: baseSlug } })) {
      counter += 1;
      baseSlug = `${slug}-${counter}`;
    }
    const org = await this.orgRepo.save(
      this.orgRepo.create({
        name: dto.organization.name,
        slug: baseSlug,
        city: dto.organization.city ?? null,
        state: dto.organization.state ?? null,
        country: dto.organization.country ?? null,
        pincode: dto.organization.pincode ?? null,
      }),
    );
    const role = await this.roleRepo.findOne({ where: { name: RoleName.ORG_ADMIN } });
    if (!role) throw new BadRequestException('ORG_ADMIN role not found');
    const passwordHash = await bcrypt.hash(dto.admin.password, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email,
        passwordHash,
        name: dto.admin.name,
        phone: dto.admin.phone ?? null,
        roleId: role.id,
        organizationId: org.id,
      }),
    );
    const withRelations = await this.userRepo.findOne({
      where: { id: user.id },
      relations: ['role', 'organization'],
    }) as User;
    return this.buildTokenResponse(withRelations!);
  }

  async signupOrgAdmin(dto: OrgAdminSignupDto) {
    const email = dto.email.toLowerCase();
    const existingUser = await this.userRepo.findOne({ where: { email } });
    if (existingUser) throw new ConflictException('Email already registered');
    const org = await this.orgRepo.findOne({ where: { id: dto.organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    const role = await this.roleRepo.findOne({ where: { name: RoleName.ORG_ADMIN } });
    if (!role) throw new BadRequestException('ORG_ADMIN role not found');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email,
        passwordHash,
        name: dto.name,
        phone: dto.phone ?? null,
        roleId: role.id,
        organizationId: org.id,
      }),
    );
    const withRelations = await this.userRepo.findOne({
      where: { id: user.id },
      relations: ['role', 'organization'],
    }) as User;
    return this.buildTokenResponse(withRelations!);
  }

  async getOrganizationsForDropdown(): Promise<{ id: number; name: string; city: string | null; state: string | null; country: string | null }[]> {
    return this.orgRepo.find({
      select: ['id', 'name', 'city', 'state', 'country'],
      order: { name: 'ASC' },
    });
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'org';
  }

  async getRoles(): Promise<{ id: number; name: string }[]> {
    return this.roleRepo.find({ select: ['id', 'name'], order: { name: 'ASC' } });
  }

  async me(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['role', 'organization'],
      select: ['id', 'email', 'name', 'phone', 'roleId', 'organizationId', 'createdAt'],
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalized = email.toLowerCase();
    const user = await this.userRepo.findOne({ where: { email: normalized } });
    if (!user) {
      return { message: 'If an account exists with this email, you will receive an OTP shortly.' };
    }
    await this.otpRepo.delete({ email: normalized, type: 'password_reset' });
    const otp = String(randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH - 1));
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await this.otpRepo.save(this.otpRepo.create({ email: normalized, otp, type: 'password_reset', expiresAt }));
    await this.emailService.sendOtp(normalized, otp);
    return { message: 'If an account exists with this email, you will receive an OTP shortly.' };
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<{ message: string }> {
    const normalized = email.toLowerCase();
    const record = await this.otpRepo.findOne({
      where: { email: normalized, type: 'password_reset', otp },
      order: { createdAt: 'DESC' },
    });
    if (!record) throw new BadRequestException('Invalid or expired OTP');
    if (new Date() > record.expiresAt) {
      await this.otpRepo.remove(record);
      throw new BadRequestException('OTP has expired');
    }
    const user = await this.userRepo.findOne({ where: { email: normalized } });
    if (!user) throw new NotFoundException('User not found');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.encryptedPlainPassword = null; // Clear stored plain password so it is not returned after user changes it
    await this.userRepo.save(user);
    await this.otpRepo.delete({ email: normalized, type: 'password_reset' });
    return { message: 'Password updated successfully. You can now login with your new password.' };
  }

  private buildTokenResponse(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role?.name ?? '',
      organizationId: user.organizationId ?? undefined,
      type: 'access',
    };
    const accessMinutes = parseInt(String(process.env.ACCESS_TOKEN_EXPIRE_MINUTES ?? 60), 10);
    const refreshDays = parseInt(String(process.env.REFRESH_TOKEN_EXPIRE_DAYS ?? 7), 10);
    const accessToken = this.jwtService.sign(
      { ...payload, type: 'access' },
      {
        expiresIn: accessMinutes * 60,
        algorithm: (process.env.ALGORITHM as 'HS256') ?? 'HS256',
      },
    );
    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        expiresIn: refreshDays * 86400,
        algorithm: (process.env.ALGORITHM as 'HS256') ?? 'HS256',
      },
    );
    const { passwordHash: _, ...safe } = user;
    return {
      user: safe,
      accessToken,
      refreshToken,
      expiresIn: accessMinutes,
    };
  }
}
