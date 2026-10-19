import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { GstFilingService } from './gst-filing.service';
import { CreateGstSessionDto } from './dto/gst-filing.dto';

@Controller('gst-filing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  RoleName.MASTER_ADMIN,
  RoleName.ORG_ADMIN,
  RoleName.CAA,
  RoleName.ORG_EMPLOYEE,
)
export class GstFilingController {
  constructor(private gst: GstFilingService) {}

  @Post('sessions')
  create(@Body() dto: CreateGstSessionDto, @CurrentUser() user: User) {
    return this.gst.create(dto, user);
  }

  @Get('sessions')
  findAll(
    @CurrentUser() user: User,
    @Query('clientId') clientId?: string,
  ) {
    return this.gst.findAll(user, clientId ? Number(clientId) : undefined);
  }

  @Get('sessions/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.gst.findOne(id, user);
  }

  @Post('sessions/:id/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    return this.gst.uploadDocument(id, file, user);
  }

  @Post('sessions/:id/compare')
  compare(@Param('id') id: string, @CurrentUser() user: User) {
    return this.gst.compare(id, user);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.gst.remove(id, user);
  }
}
