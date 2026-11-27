import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionProfile } from '../entities/permission-profile.entity';
import { UserBusinessUnit } from '../entities/user-business-unit.entity';
import { UserOrgUnit } from '../entities/org-unit.entity';
import { BusinessUnit } from '../entities/business-unit.entity';
import { User } from '../entities/user.entity';
import { Team } from '../entities/team.entity';
import { AuditEvent } from '../entities/audit-event.entity';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { PermissionsGuard } from './permissions.guard';
import { AuditService } from './audit.service';
import { TeamsService } from './teams.service';

/** Global so any module can put @Require(...) on its routes and inject AccessService. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PermissionProfile, UserBusinessUnit, UserOrgUnit, BusinessUnit, User, Team, AuditEvent])],
  controllers: [AccessController],
  providers: [AccessService, PermissionsGuard, AuditService, TeamsService],
  exports: [AccessService, PermissionsGuard, AuditService, TeamsService],
})
export class AccessModule {}
