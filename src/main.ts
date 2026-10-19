// Force UTC timezone so TypeORM reads PostgreSQL 'timestamp' columns correctly
process.env.TZ = 'UTC';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // Explicitly allow public form and tracking endpoints from any browser origin
      // (Public Key origin validation takes care of domain whitelisting per customer key)
      const allowedLocals = ['http://localhost:3000', 'http://127.0.0.1:3000'];
      if (allowedLocals.includes(origin) || corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      // For public API routes and form submissions, allow browser origin
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Public-Key',
      'X-API-Key',
      'X-Requested-With',
    ],
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
