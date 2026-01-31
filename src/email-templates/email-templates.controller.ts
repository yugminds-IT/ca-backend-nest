import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { EmailService } from '../email/email.service';
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { SendTemplateEmailDto } from './dto/send-template-email.dto';
import { SendTestMailDto } from './dto/send-test-mail.dto';

@Controller('email-templates')
@UseGuards(JwtAuthGuard)
export class EmailTemplatesController {
  constructor(
    private service: EmailTemplatesService,
    private emailService: EmailService,
  ) {}

  /** Send a simple test email (no auth required). */
  @Public()
  @Post('test-mail')
  async sendTestMail(@Body() dto: SendTestMailDto) {
    const subject = dto.subject ?? 'CAA Test Email';
    const body = dto.body ?? 'This is a test email from the CAA backend.';
    const sent = await this.emailService.sendMail(dto.to, subject, body);
    return { sent, message: sent ? 'Email sent successfully' : 'SMTP not configured or failed to send' };
  }

  /** Dropdown: list categories */
  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  /** Dropdown: list types by category (query: category=service) */
  @Get('types')
  getTypes(@Query('category') category: string) {
    return this.service.getTypesByCategory(category ?? '');
  }

  /** Dropdown: list available variables */
  @Get('variables')
  getVariables() {
    return this.service.getVariables();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  create(@Body() dto: CreateEmailTemplateDto, @CurrentUser() user: User) {
    return this.service.create(dto, user);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  findAll(
    @CurrentUser() user: User,
    @Query('category') category?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = organizationId != null ? parseInt(organizationId, 10) : undefined;
    return this.service.findAll(user, category, orgId);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmailTemplateDto,
    @CurrentUser() user: User,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.remove(id, user);
  }

  /** Send email using a template (substitutes variables, converts to HTML). */
  @Post('send')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  sendWithTemplate(@Body() dto: SendTemplateEmailDto, @CurrentUser() user: User) {
    return this.service.sendWithTemplate(dto.to, dto.templateId, dto.variables ?? {}, user);
  }
}
