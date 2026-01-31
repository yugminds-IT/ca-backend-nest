import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { RoleName } from '../common/enums/role.enum';
import { ClientFilesService } from './client-files.service';

@Controller('client-files')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientFilesController {
  constructor(private clientFiles: ClientFilesService) {}

  /** Client only: upload files. */
  @Post('upload')
  @Roles(RoleName.CLIENT)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'files', maxCount: 20 }]),
  )
  upload(
    @UploadedFiles() uploaded: { files?: Express.Multer.File[] },
    @CurrentUser() user: User,
    @Body('type') documentType?: string,
  ) {
    const files = uploaded?.files ?? [];
    if (!files.length) {
      return { message: 'No files uploaded', data: [] };
    }
    return this.clientFiles.uploadFiles(files, user, documentType);
  }

  /** Client only: list own uploaded files. */
  @Get()
  @Roles(RoleName.CLIENT)
  list(@CurrentUser() user: User) {
    return this.clientFiles.list(user);
  }

  /** Org users only: list uploaded files for a client linked to their organization. */
  @Get('client/:clientId')
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  listByClient(@Param('clientId', ParseIntPipe) clientId: number, @CurrentUser() user: User) {
    return this.clientFiles.listByClient(clientId, user);
  }

  /** Client or org user: get presigned download URL (client: own files; org: files of clients in their org). */
  @Get(':id/download-url')
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE, RoleName.CLIENT)
  getDownloadUrl(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.clientFiles.getDownloadUrl(id, user);
  }
}
