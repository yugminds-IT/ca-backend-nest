import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ActivityLogService } from '../activity-log/activity-log.service';

const SKIP_LOG_PATHS = ['/auth/refresh', '/auth/login', '/auth/logout', '/'];
const MUTATION_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

function extractIp(req: Record<string, unknown>): string | null {
  const forwarded = req.headers as Record<string, string>;
  return (
    (forwarded['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    (req.ip as string) ??
    null
  );
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(
    @Optional() private readonly activityLog?: ActivityLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req as { method: string; url: string };
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const durationMs = Date.now() - now;
          this.logger.log(`${method} ${url} ${res.statusCode} ${durationMs}ms`);

          const isMutation = MUTATION_METHODS.includes(method);
          const isSkipped = SKIP_LOG_PATHS.some((p) => url.startsWith(p));
          if (isMutation && !isSkipped && this.activityLog) {
            const user = (req as Record<string, unknown>).user as Record<string, unknown> | undefined;
            void this.activityLog.log({
              type: 'info',
              userId: (user?.id as number) ?? null,
              userEmail: (user?.email as string) ?? null,
              userRole: (user?.role as Record<string, string>)?.name ?? null,
              organizationId: (user?.organizationId as number) ?? null,
              method,
              path: url,
              description: `${method} ${url}`,
              ipAddress: extractIp(req as Record<string, unknown>),
              userAgent: (req as Record<string, Record<string, string>>).headers?.['user-agent'] ?? null,
              statusCode: res.statusCode as number,
              durationMs,
              isError: false,
            });
          }
        },
        error: (err: Error & { status?: number }) => {
          const status = err?.status ?? 500;
          const durationMs = Date.now() - now;
          this.logger.error(`${method} ${url} ${status} ${durationMs}ms — ${err?.message}`);

          const isSkipped = SKIP_LOG_PATHS.some((p) => url.startsWith(p));
          if (!isSkipped && this.activityLog) {
            const user = (req as Record<string, unknown>).user as Record<string, unknown> | undefined;
            void this.activityLog.log({
              type: 'error',
              userId: (user?.id as number) ?? null,
              userEmail: (user?.email as string) ?? null,
              userRole: (user?.role as Record<string, string>)?.name ?? null,
              organizationId: (user?.organizationId as number) ?? null,
              method,
              path: url,
              description: err?.message ?? 'Unknown error',
              ipAddress: extractIp(req as Record<string, unknown>),
              userAgent: (req as Record<string, Record<string, string>>).headers?.['user-agent'] ?? null,
              statusCode: status,
              durationMs,
              isError: true,
            });
          }
        },
      }),
    );
  }
}
