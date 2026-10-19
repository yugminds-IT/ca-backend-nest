import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DeveloperService } from './developer.service';
import {
  CreateApiKeyDto,
  UpdateApiKeyDto,
  SendEmailApiDto,
  SendFormSubmissionDto,
  CreateWebhookDto,
} from './dto/developer.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiRateLimitGuard } from '../common/guards/api-rate-limit.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { INDUSTRY_PRESETS } from '../common/industry-presets';

// Transparent 1x1 GIF buffer for open-tracking
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Controller()
export class DeveloperController {
  constructor(private readonly developerService: DeveloperService) {}

  // ------------------------------------------------------------- Public Industry Presets Catalog
  @Public()
  @Get('developer/industries')
  getIndustries() {
    return Object.values(INDUSTRY_PRESETS);
  }

  // ------------------------------------------------------------- EmailJS Model: Public Form Submission
  @Public()
  @UseGuards(ApiRateLimitGuard)
  @UsePipes(new ValidationPipe({ whitelist: false, transform: true }))
  @Post(['api/v1/send-form', 'api/v1/forms', 'api/v1/submissions', 'developer/send-form'])
  async sendForm(
    @Body() body: SendFormSubmissionDto,
    @Headers('x-public-key') headerPublicKey: string | undefined,
    @Headers('x-api-key') headerApiKey: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Headers('referer') referer: string | undefined,
    @Req() req: Request,
  ) {
    const rawBody = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const payload = { ...rawBody, ...body };
    const authBearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const detectedKey =
      payload.publicKey ||
      payload.apiKey ||
      payload.secretKey ||
      headerPublicKey ||
      headerApiKey ||
      authBearer;

    if (!payload.publicKey && detectedKey) {
      payload.publicKey = detectedKey;
    }
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    return this.developerService.handleFormSubmission(payload, { origin, referer, ip });
  }

  // ------------------------------------------------------------- Resend Model: Transactional Email API
  @Public()
  @UseGuards(ApiRateLimitGuard)
  @Post('api/v1/emails')
  async sendEmail(
    @Body() body: SendEmailApiDto,
    @Headers('authorization') authHeader: string | undefined,
    @Headers('x-api-key') apiKeyHeader: string | undefined,
  ) {
    const rawKey =
      apiKeyHeader ||
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined);

    if (!rawKey) {
      throw new UnauthorizedException(
        'Missing API Key. Pass "Authorization: Bearer sk_live_..." or "X-API-Key: sk_live_..."',
      );
    }

    const { org, apiKey } = await this.developerService.authenticateSecretKey(rawKey);
    return this.developerService.sendTransactional(org.id, apiKey.id, body);
  }

  // ------------------------------------------------------------- Open & Click Telemetry
  @Public()
  @Get('api/v1/track/open/:messageId.png')
  async trackOpen(@Param('messageId') messageId: string, @Res() res: Response) {
    void this.developerService.recordOpen(messageId);
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.end(TRANSPARENT_GIF_BUFFER);
  }

  @Public()
  @Get('api/v1/track/click/:messageId')
  async trackClick(
    @Param('messageId') messageId: string,
    @Query('url') targetUrl: string,
    @Res() res: Response,
  ) {
    const safeUrl = await this.developerService.recordClick(messageId, targetUrl);
    return res.redirect(302, safeUrl);
  }

  // ------------------------------------------------------------- Dashboard: API Keys Management
  @UseGuards(JwtAuthGuard)
  @Get('developer/api-keys')
  listApiKeys(@CurrentUser() user: User) {
    return this.developerService.listApiKeys(user.organizationId!);
  }

  @UseGuards(JwtAuthGuard)
  @Post('developer/api-keys')
  createApiKey(@CurrentUser() user: User, @Body() dto: CreateApiKeyDto) {
    return this.developerService.createApiKey(user.organizationId!, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('developer/api-keys/:id')
  updateApiKey(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyDto,
  ) {
    return this.developerService.updateApiKey(user.organizationId!, Number(id), dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('developer/api-keys/:id')
  revokeApiKey(@CurrentUser() user: User, @Param('id') id: string) {
    return this.developerService.revokeApiKey(user.organizationId!, Number(id));
  }

  // ------------------------------------------------------------- Dashboard: Contact Form Inbox
  @UseGuards(JwtAuthGuard)
  @Get('developer/inbox')
  listSubmissions(@CurrentUser() user: User, @Query('status') status?: string) {
    return this.developerService.listSubmissions(user.organizationId!, status);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('developer/inbox/:id/status')
  updateSubmissionStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.developerService.updateSubmissionStatus(user.organizationId!, Number(id), status);
  }

  @UseGuards(JwtAuthGuard)
  @Post('developer/inbox/:id/convert-to-client')
  convertToClient(@CurrentUser() user: User, @Param('id') id: string) {
    return this.developerService.convertToClient(user.organizationId!, Number(id));
  }

  @UseGuards(JwtAuthGuard)
  @Delete('developer/inbox/:id')
  deleteSubmission(@CurrentUser() user: User, @Param('id') id: string) {
    return this.developerService.deleteSubmission(user.organizationId!, Number(id));
  }

  // ------------------------------------------------------------- Dashboard: Delivery Logs
  @UseGuards(JwtAuthGuard)
  @Get('developer/logs')
  listLogs(@CurrentUser() user: User, @Query('status') status?: string) {
    return this.developerService.listLogs(user.organizationId!, status);
  }

  // ------------------------------------------------------------- Dashboard: Webhooks
  @UseGuards(JwtAuthGuard)
  @Get('developer/webhooks')
  listWebhooks(@CurrentUser() user: User) {
    return this.developerService.listWebhooks(user.organizationId!);
  }

  @UseGuards(JwtAuthGuard)
  @Post('developer/webhooks')
  createWebhook(@CurrentUser() user: User, @Body() dto: CreateWebhookDto) {
    return this.developerService.createWebhook(user.organizationId!, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('developer/webhooks/:id')
  deleteWebhook(@CurrentUser() user: User, @Param('id') id: string) {
    return this.developerService.deleteWebhook(user.organizationId!, Number(id));
  }
}
