import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Service } from '../s3/s3.service';
import { attachmentKey, checkUpload, MAX_FILE_BYTES } from './mail-attachments';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { MailManagementService } from './mail-management.service';
import { ScheduleEmailDto } from './dto/schedule-email.dto';
import { SendBulkDto } from './dto/send-bulk.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { UpdateRecurringScheduleDto } from './dto/update-recurring-schedule.dto';
import { DraftsService, SaveDraftDto, UpdateDraftDto } from './drafts.service';

@Controller('mail-management')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
export class MailManagementController {
  constructor(private service: MailManagementService, private s3: S3Service, private drafts: DraftsService) {}

  // ── Unsent emails (each person sees only their own) ──
  @Get('drafts')
  listDrafts(@CurrentUser() user: User) {
    return this.drafts.list(user);
  }

  @Get('drafts/:id')
  getDraft(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.drafts.get(user, id);
  }

  @Post('drafts')
  createDraft(@CurrentUser() user: User, @Body() dto: SaveDraftDto) {
    return this.drafts.create(user, dto);
  }

  @Patch('drafts/:id')
  updateDraft(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDraftDto) {
    return this.drafts.update(user, id, dto);
  }

  @Delete('drafts/:id')
  deleteDraft(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.drafts.remove(user, id);
  }

  /** Upload one file to attach to a send; returns the reference to pass in `attachments`. */
  @Post('attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  async uploadAttachment(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: User) {
    checkUpload(file);
    const key = attachmentKey(user.role?.name === RoleName.MASTER_ADMIN ? null : user.organizationId, file.originalname);
    const contentType = file.mimetype || 'application/octet-stream';
    await this.s3.upload(key, file.buffer, contentType);
    return { key, name: file.originalname, size: file.size, contentType };
  }

  /** Client emails + director emails (+ org user emails for master admin) for dropdown */
  @Get('recipients')
  getRecipients(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    const orgId = organizationId != null ? parseInt(organizationId, 10) : undefined;
    return this.service.getRecipients(user, orgId);
  }

  /** Master admin only: list org user emails (org mails) for sending */
  @Get('org-mails')
  @Roles(RoleName.MASTER_ADMIN)
  getOrgMails(@CurrentUser() user: User, @Query('organizationId') organizationId?: string) {
    const orgId = organizationId != null ? parseInt(organizationId, 10) : undefined;
    return this.service.getOrgMails(user, orgId);
  }

  /** Templates available for sending: master = only global; org = global + org's own */
  @Get('templates')
  getTemplatesForSending(@CurrentUser() user: User) {
    return this.service.getTemplatesForSending(user);
  }

  /** Send one message to many recipients now; queued and sent by the server. */
  @Post('send-bulk')
  sendBulk(@Body() dto: SendBulkDto, @CurrentUser() user: User) {
    return this.service.queueBulkSend(dto, user);
  }

  @Post('schedule')
  createSchedule(@Body() dto: ScheduleEmailDto, @CurrentUser() user: User) {
    return this.service.createSchedule(dto, user);
  }

  @Get('schedules')
  listSchedules(
    @CurrentUser() user: User,
    @Query('status') status?: 'pending' | 'sent' | 'failed' | 'cancelled',
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = organizationId != null ? parseInt(organizationId, 10) : undefined;
    return this.service.listSchedules(user, status, orgId);
  }

  @Get('schedules/:id')
  getSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.getSchedule(id, user);
  }

  @Patch('schedules/:id')
  updateSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() user: User,
  ) {
    return this.service.updateSchedule(id, dto, user);
  }

  /** What happened to each recipient of one send */
  @Get('schedules/:id/deliveries')
  deliveries(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.deliveries(id, user);
  }

  /** Send the same email again, now, to the recipients it failed for */
  @Post('schedules/:id/resend-failed')
  resendFailed(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.resendFailed(id, user);
  }

  @Delete('schedules/:id')
  cancelSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.cancelSchedule(id, user);
  }

  @Get('recurring')
  listRecurringSchedules(@CurrentUser() user: User) {
    return this.service.listRecurringSchedules(user);
  }

  @Patch('recurring/:id/stop')
  stopRecurringSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.stopRecurringSchedule(id, user);
  }

  @Patch('recurring/:id/start')
  startRecurringSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.startRecurringSchedule(id, user);
  }

  @Patch('recurring/:id')
  updateRecurringSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecurringScheduleDto,
    @CurrentUser() user: User,
  ) {
    return this.service.updateRecurringSchedule(id, dto, user);
  }

  @Delete('recurring/:id')
  deleteRecurringSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.deleteRecurringSchedule(id, user);
  }
}
