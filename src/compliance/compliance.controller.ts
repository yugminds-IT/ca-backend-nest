import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Param,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ComplianceService } from './compliance.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';

@Controller()
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  // ------------------------------------------------------------- RFC 8058 One-Click Unsubscribe (GET & POST)
  @Public()
  @Get('api/v1/unsubscribe')
  async handleGetUnsubscribe(@Query('token') token: string, @Res() res: Response) {
    if (!token) throw new BadRequestException('Unsubscribe token is required');
    const { email, orgId } = this.complianceService.verifyUnsubscribeToken(token);
    await this.complianceService.addSuppression(orgId, email, 'unsubscribed', 'One-Click Unsubscribe Link');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed Successfully</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 36px; max-width: 440px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
            .icon { width: 56px; height: 56px; background: #10b981; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 20px; }
            h1 { font-size: 22px; font-weight: 700; margin: 0 0 10px; color: #fff; }
            p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px; }
            .badge { display: inline-block; background: #334155; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-family: monospace; color: #38bdf8; margin-bottom: 24px; }
            .footer { font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✓</div>
            <h1>You have been unsubscribed</h1>
            <p>You will no longer receive marketing and notification emails sent to:</p>
            <div class="badge">${email}</div>
            <p class="footer">If this was a mistake, please contact the sender directly to reactivate your subscription.</p>
          </div>
        </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }

  @Public()
  @Post('api/v1/unsubscribe')
  async handlePostUnsubscribe(@Query('token') token: string, @Body() body: any) {
    const rawToken = token || body?.token;
    if (!rawToken) throw new BadRequestException('Missing token');
    const { email, orgId } = this.complianceService.verifyUnsubscribeToken(rawToken);
    await this.complianceService.addSuppression(orgId, email, 'unsubscribed', 'RFC 8058 One-Click Header');
    return { success: true, message: `Unsubscribed ${email}` };
  }

  // ------------------------------------------------------------- Dashboard Suppression Management
  @UseGuards(JwtAuthGuard)
  @Get('compliance/suppressions')
  listSuppressions(@CurrentUser() user: User, @Query('search') search?: string) {
    return this.complianceService.listSuppressions(user.organizationId!, search);
  }

  @UseGuards(JwtAuthGuard)
  @Post('compliance/suppressions')
  addSuppression(
    @CurrentUser() user: User,
    @Body('email') email: string,
    @Body('reason') reason?: any,
  ) {
    if (!email) throw new BadRequestException('Email is required');
    return this.complianceService.addSuppression(
      user.organizationId!,
      email,
      reason || 'manual',
      'Dashboard Manual Add',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('compliance/suppressions/:id')
  removeSuppression(@CurrentUser() user: User, @Param('id') id: string) {
    return this.complianceService.removeSuppression(user.organizationId!, Number(id));
  }

  // ------------------------------------------------------------- Live DNS Verification Check
  @Public()
  @Get('compliance/dns-check')
  checkDns(@Query('domain') domain: string) {
    if (!domain) throw new BadRequestException('Domain query parameter required');
    return this.complianceService.checkDomainDns(domain);
  }

  @Public()
  @Get('api/v1/compliance/verify-domain')
  verifyDomain(@Query('domain') domain: string) {
    if (!domain) throw new BadRequestException('Domain query parameter required');
    return this.complianceService.checkDomainDns(domain);
  }
}
