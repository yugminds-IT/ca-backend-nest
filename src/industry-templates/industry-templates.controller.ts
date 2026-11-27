import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RoleName } from '../common/enums/role.enum';
import { IndustryTemplatesService } from './industry-templates.service';
import { UpdateIndustryTemplateDto } from './industry-templates.dto';

/** Lists are readable by any signed-in staff member. Editing is for master admins only. */
@Controller('industry-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IndustryTemplatesController {
  constructor(private readonly templates: IndustryTemplatesService) {}

  @Get()
  @Roles(RoleName.MASTER_ADMIN, RoleName.ORG_ADMIN, RoleName.CAA, RoleName.ORG_EMPLOYEE)
  list() {
    return this.templates.list();
  }

  @Patch(':key')
  @Roles(RoleName.MASTER_ADMIN)
  update(@Param('key') key: string, @Body() body: UpdateIndustryTemplateDto) {
    return this.templates.update(key, body);
  }
}
