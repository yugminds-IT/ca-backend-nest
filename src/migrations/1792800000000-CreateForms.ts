import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hosted and embeddable forms. Each form has its own public API key (api_keys row), so its
 * submissions use the same intake path as every other key.
 *
 * Idempotent: safe to run more than once.
 */
export class CreateForms1792800000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "forms" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer NOT NULL REFERENCES "business_units"("id") ON DELETE CASCADE,
        "apiKeyId" integer NOT NULL REFERENCES "api_keys"("id") ON DELETE CASCADE,
        "name" varchar(150) NOT NULL,
        "slug" varchar(80) NOT NULL,
        "fields" jsonb NOT NULL DEFAULT '[]',
        "submitLabel" varchar(60) NOT NULL DEFAULT 'Send',
        "successMessage" text NOT NULL DEFAULT 'Thank you! We have received your details.',
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_forms_slug" ON "forms" ("slug")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_forms_organizationId" ON "forms" ("organizationId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "forms"`);
  }
}
