import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';

export interface AuthRateLimitRule {
  /** Groups counters, so different routes do not share a budget. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** Count per client IP, per email in the body, or both (two separate budgets). */
  by: Array<'ip' | 'email'>;
}

const RULES_KEY = 'auth_rate_limit_rules';

/** Limits a public auth route. Pair with @UseGuards(AuthRateLimitGuard). */
export const AuthRateLimit = (...rules: AuthRateLimitRule[]) => SetMetadata(RULES_KEY, rules);

const MINUTE = 60 * 1000;
export const AUTH_LIMITS: Record<
  'login' | 'forgotPassword' | 'resetCode' | 'signup' | 'refresh' | 'invite',
  AuthRateLimitRule[]
> = {
  login: [
    { name: 'login', limit: 10, windowMs: 15 * MINUTE, by: ['email'] },
    { name: 'login', limit: 50, windowMs: 15 * MINUTE, by: ['ip'] },
  ],
  forgotPassword: [
    { name: 'forgot', limit: 3, windowMs: 15 * MINUTE, by: ['email'] },
    { name: 'forgot', limit: 20, windowMs: 60 * MINUTE, by: ['ip'] },
  ],
  resetCode: [
    { name: 'reset-code', limit: 10, windowMs: 15 * MINUTE, by: ['email'] },
    { name: 'reset-code', limit: 30, windowMs: 15 * MINUTE, by: ['ip'] },
  ],
  signup: [{ name: 'signup', limit: 5, windowMs: 60 * MINUTE, by: ['ip'] }],
  refresh: [{ name: 'refresh', limit: 60, windowMs: MINUTE, by: ['ip'] }],
  invite: [{ name: 'invite', limit: 20, windowMs: 15 * MINUTE, by: ['ip'] }],
};

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * In-memory limiter for login, signup and password reset, to stop password and reset-code guessing.
 * Uses the connection IP (req.ip), not a raw X-Forwarded-For header, which any client can set.
 * Behind a proxy, set TRUST_PROXY so Express fills req.ip from the proxy's header.
 * Counters live in this process: with several instances, each enforces its own budget.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private static readonly store = new Map<string, Counter>();
  private static sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly reflector: Reflector) {
    if (!AuthRateLimitGuard.sweeper) {
      AuthRateLimitGuard.sweeper = setInterval(() => AuthRateLimitGuard.sweep(Date.now()), 5 * MINUTE);
      AuthRateLimitGuard.sweeper.unref?.();
    }
  }

  static sweep(now: number): void {
    for (const [key, c] of AuthRateLimitGuard.store) if (now > c.resetAt) AuthRateLimitGuard.store.delete(key);
  }

  /** For tests. */
  static reset(): void {
    AuthRateLimitGuard.store.clear();
  }

  canActivate(context: ExecutionContext): boolean {
    const rules = this.reflector.get<AuthRateLimitRule[]>(RULES_KEY, context.getHandler());
    if (!rules?.length) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawEmail =
      typeof body.email === 'string'
        ? body.email
        : typeof (body.admin as Record<string, unknown> | undefined)?.email === 'string'
          ? ((body.admin as Record<string, unknown>).email as string)
          : '';
    const email = rawEmail.trim().toLowerCase();
    const now = Date.now();

    for (const rule of rules) {
      for (const by of rule.by) {
        const subject = by === 'ip' ? ip : email;
        if (!subject) continue;
        const key = `${rule.name}:${by}:${subject}`;
        let c = AuthRateLimitGuard.store.get(key);
        if (!c || now > c.resetAt) {
          c = { count: 0, resetAt: now + rule.windowMs };
          AuthRateLimitGuard.store.set(key, c);
        }
        c.count += 1;
        if (c.count > rule.limit) {
          res.setHeader?.('Retry-After', Math.ceil((c.resetAt - now) / 1000));
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              error: 'Too Many Requests',
              message: 'Too many attempts. Please wait a few minutes and try again.',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    }
    return true;
  }
}
