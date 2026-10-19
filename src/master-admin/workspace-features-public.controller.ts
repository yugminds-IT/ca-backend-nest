import { Controller, Get } from '@nestjs/common';
import { MasterAdminService } from './master-admin.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('api/v1/workspace-features')
export class WorkspaceFeaturesPublicController {
  constructor(private readonly masterAdminService: MasterAdminService) {}

  @Public()
  @Get()
  getPublicWorkspaceFeatures() {
    return this.masterAdminService.listPublicWorkspaceFeatures();
  }
}
