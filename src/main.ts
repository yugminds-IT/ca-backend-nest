// Force UTC timezone so TypeORM reads PostgreSQL 'timestamp' columns correctly
process.env.TZ = 'UTC';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // A 1,000-recipient bulk send with per-client variables is a few hundred KB (default limit 100KB)
  (app as NestExpressApplication).useBodyParser('json', { limit: '5mb' });
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const allowedAppOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', ...corsOrigins];

  const corsAllowedHeaders = [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-Public-Key',
    'X-API-Key',
    'X-Requested-With',
  ];

  // These are deliberately-public, key-authenticated integration endpoints (form submission,
  // transactional email API, open/click tracking) that customers embed on their own websites.
  // Domain whitelisting for them happens per public/secret key inside their handlers, not via CORS,
  // so they stay open to any browser origin. They never rely on cookies, so no CORS credentials.
  const openCorsPathPatterns = [
    /^\/developer\/industries$/,
    /^\/(api\/v1\/(send-form|forms|submissions)|developer\/send-form)$/,
    /^\/api\/v1\/emails$/,
    /^\/api\/v1\/track\/(open|click)\//,
    /^\/contact(\/|$)/,
    /^\/api\/v1\/workspace-features(\/|$)/,
  ];

  app.enableCors((req: { url?: string }, callback: (err: Error | null, options?: Record<string, unknown>) => void) => {
    const path = req.url?.split('?')[0] ?? '';
    const isOpenIntegrationRoute = openCorsPathPatterns.some((pattern) => pattern.test(path));

    if (isOpenIntegrationRoute) {
      return callback(null, {
        origin: true,
        credentials: false,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: corsAllowedHeaders,
      });
    }

    return callback(null, {
      origin: (origin: string | undefined, originCallback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin || allowedAppOrigins.includes(origin)) {
          return originCallback(null, true);
        }
        return originCallback(new Error('Not allowed by CORS'), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: corsAllowedHeaders,
    });
  });

  // Security headers
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable('x-powered-by');
  expressApp.use((_req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
