import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '../entities/user.entity';
import { REQUIRE_PERMISSIONS_KEY } from './require.decorator';
import { AccessService } from './access.service';

/** Checks @Require(...) permissions. Put it after JwtAuthGuard. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (!user) throw new ForbiddenException('Access denied');
    const ctx = await this.access.contextFor(user);
    const missing = required.find((p) => !ctx.permissions.has(p));
    if (missing) throw new ForbiddenException(`Missing permission: ${missing}`);
    return true;
  }
}
