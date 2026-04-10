import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

// Same merge as app: `.env.example` defaults, then `.env` overrides (override: true).
const root = process.cwd();
const examplePath = resolve(root, '.env.example');
const envPath = resolve(root, '.env');
if (existsSync(examplePath)) config({ path: examplePath });
if (existsSync(envPath)) config({ path: envPath, override: true });

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/entities/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  extra: process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : undefined,
});
