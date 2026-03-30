import { Controller, Post, Body, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { MasterAdminSignupDto } from './dto/master-admin-signup.dto';
import { OrganizationSignupDto } from './dto/organization-signup.dto';
import { OrgAdminSignupDto } from './dto/org-admin-signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;
    const userAgent = req.headers['user-agent'] ?? null;
    return this.auth.login(dto, { ipAddress, userAgent });
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: User, @Req() req: Request) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;
    const userAgent = req.headers['user-agent'] ?? null;
    return this.auth.logout(user, { ipAddress, userAgent });
  }

  @Public()
  @Post('signup/master-admin')
  signupMasterAdmin(@Body() dto: MasterAdminSignupDto) {
    return this.auth.signupMasterAdmin(dto);
  }

  @Public()
  @Post('signup/organization')
  signupOrganization(@Body() dto: OrganizationSignupDto) {
    return this.auth.signupOrganization(dto);
  }

  @Public()
  @Post('signup/org-admin')
  signupOrgAdmin(@Body() dto: OrgAdminSignupDto) {
    return this.auth.signupOrgAdmin(dto);
  }

  @Public()
  @Get('organizations')
  getOrganizationsForDropdown() {
    return this.auth.getOrganizationsForDropdown();
  }

  @Public()
  @Get('roles')
  getRoles() {
    return this.auth.getRoles();
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.email, dto.otp, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: User) {
    return this.auth.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }
}
