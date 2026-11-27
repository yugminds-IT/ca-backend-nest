import { Controller, Post, Body, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { MasterAdminSignupDto } from './dto/master-admin-signup.dto';
import { OrganizationSignupDto } from './dto/organization-signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RoleName } from '../common/enums/role.enum';
import { AUTH_LIMITS, AuthRateLimit, AuthRateLimitGuard } from '../common/guards/auth-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) { }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(...AUTH_LIMITS.login)
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

  /** Only an existing master admin can add another. The first one is created with `npm run create-master-admin`. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.MASTER_ADMIN)
  @Post('signup/master-admin')
  signupMasterAdmin(@Body() dto: MasterAdminSignupDto) {
    return this.auth.signupMasterAdmin(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(...AUTH_LIMITS.signup)
  @Post('signup/organization')
  signupOrganization(@Body() dto: OrganizationSignupDto) {
    return this.auth.signupOrganization(dto);
  }

  // Lists every organization, so only the platform owner may see it.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.MASTER_ADMIN)
  @Get('organizations')
  getOrganizationsForDropdown() {
    return this.auth.getOrganizationsForDropdown();
  }

  @Public()
  @Get('roles')
  getRoles() {
    return this.auth.getRoles();
  }

  // Creates an account with any role, so only the platform owner may use it.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.MASTER_ADMIN)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(...AUTH_LIMITS.refresh)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(...AUTH_LIMITS.forgotPassword)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(...AUTH_LIMITS.resetCode)
  @Post('verify-password-reset-otp')
  verifyPasswordResetOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyPasswordResetOtp(dto.email, dto.otp);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(...AUTH_LIMITS.resetCode)
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
