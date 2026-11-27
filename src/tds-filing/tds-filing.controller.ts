import { PlanGuard, Entitle } from '../billing/plan.guard';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { TdsFilingService } from './tds-filing.service';
import { CreateTdsSessionDto, SetFormTypeDto } from './dto/tds-filing.dto';

@Controller('tds-filing')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@Entitle({ module: 'tds' })
@Roles(
  RoleName.MASTER_ADMIN,
  RoleName.ORG_ADMIN,
  RoleName.CAA,
  RoleName.ORG_EMPLOYEE,
)
export class TdsFilingController {
  constructor(private tds: TdsFilingService) {}

  @Get('forms')
  getForms() {
    return this.tds.getForms();
  }

  @Post('sessions')
  create(@Body() dto: CreateTdsSessionDto, @CurrentUser() user: User) {
    return this.tds.create(dto, user);
  }

  @Get('sessions')
  findAll(@CurrentUser() user: User) {
    return this.tds.findAll(user);
  }

  @Get('sessions/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.tds.findOne(id, user);
  }

  @Post('sessions/:id/challan')
  @UseInterceptors(FileInterceptor('file'))
  uploadChallan(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    return this.tds.uploadChallan(id, file, user);
  }

  @Post('sessions/:id/excel')
  @UseInterceptors(FileInterceptor('file'))
  uploadExcel(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    return this.tds.uploadExcel(id, file, user);
  }

  @Post('sessions/:id/compare')
  compare(@Param('id') id: string, @CurrentUser() user: User) {
    return this.tds.compare(id, user);
  }

  @Patch('sessions/:id/form')
  setFormType(
    @Param('id') id: string,
    @Body() dto: SetFormTypeDto,
    @CurrentUser() user: User,
  ) {
    return this.tds.setFormType(id, dto, user);
  }

  @Post('sessions/:id/generate')
  generate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.tds.generate(id, user);
  }

  @Get('sessions/:id/status')
  getStatus(@Param('id') id: string, @CurrentUser() user: User) {
    return this.tds.getGenerationStatus(id, user);
  }

  @Get('sessions/:id/download/:type')
  async download(
    @Param('id') id: string,
    @Param('type') type: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    if (type !== 'csi' && type !== 'fvu') throw new BadRequestException('type must be csi or fvu');
    const { content, filename } = await this.tds.downloadFile(id, type, user);
    const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(content);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.tds.remove(id, user);
  }
}
