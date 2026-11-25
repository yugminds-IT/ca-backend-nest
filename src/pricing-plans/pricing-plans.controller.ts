import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PricingPlansService } from './pricing-plans.service';
import { PricingPlanDto } from './pricing-plan.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RoleName } from '../common/enums/role.enum';

@Controller()
export class PricingPlansController {
  constructor(private readonly service: PricingPlansService) {}

  /** Active plans for the marketing site. */
  @Public()
  @Get('api/v1/pricing-plans')
  listPublic() {
    return this.service.listPublic();
  }

  @Get('master-admin/pricing-plans')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN)
  listAll() {
    return this.service.listAll();
  }

  @Post('master-admin/pricing-plans')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN)
  create(@Body() dto: PricingPlanDto) {
    return this.service.create(dto);
  }

  @Patch('master-admin/pricing-plans/:id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: PricingPlanDto) {
    return this.service.update(id, dto);
  }

  @Delete('master-admin/pricing-plans/:id')
  @UseGuards(RolesGuard)
  @Roles(RoleName.MASTER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
