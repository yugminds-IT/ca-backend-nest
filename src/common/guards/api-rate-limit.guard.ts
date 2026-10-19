import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  private static readonly store = new Map<string, RateLimitRecord>();

  // Cleanup expired keys periodically every 5 minutes
  constructor() {
    if (!ApiRateLimitGuard.cleanupStarted) {
      ApiRateLimitGuard.cleanupStarted = true;
      setInterval(() => {
        const now = Date.now();
        for (const [key, record] of ApiRateLimitGuard.store.entries()) {
          if (now > record.resetAt) {
            ApiRateLimitGuard.store.delete(key);
          }
        }
      }, 5 * 60 * 1000);
    }
  }

  private static cleanupStarted = false;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown-ip';

    const path = req.path || req.url;
    const isPublicForm = path.includes('send-form');

    // Limit configuration
    const maxRequests = isPublicForm ? 25 : 120; // 25 submissions/min for forms, 120/min for API
    const windowMs = 60 * 1000; // 1 minute sliding window
    const now = Date.now();

    const rateKey = `${ip}:${isPublicForm ? 'form' : 'api'}`;
    let record = ApiRateLimitGuard.store.get(rateKey);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + windowMs };
      ApiRateLimitGuard.store.set(rateKey, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((record.resetAt - now) / 1000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: isPublicForm
            ? 'Form submission rate limit exceeded. Please wait a minute before submitting again.'
            : 'API rate limit exceeded. Please slow down your requests.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
