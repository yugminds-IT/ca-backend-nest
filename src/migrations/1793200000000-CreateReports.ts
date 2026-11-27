import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reports and dashboards (Phase 8): saved dashboards and scheduled report emails.
 * Adds two new tables only, so it is safe on a live database. Idempotent (IF NOT EXISTS throughout).
 */
export class CreateReports1793200000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "dashboards" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "createdByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "name" varchar(120) NOT NULL,
        "widgets" jsonb NOT NULL DEFAULT '[]',
        "filters" jsonb NOT NULL DEFAULT '{}',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_dashboards_org" ON "dashboards" ("organizationId")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "report_schedules" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "createdByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "name" varchar(120) NOT NULL,
        "scope" varchar(16) NOT NULL DEFAULT 'standard',
        "dashboardId" integer REFERENCES "dashboards"("id") ON DELETE CASCADE,
        "frequency" varchar(12) NOT NULL,
        "dayOfWeek" integer,
        "dayOfMonth" integer,
        "hourIst" integer NOT NULL DEFAULT 9,
        "recipients" jsonb NOT NULL DEFAULT '[]',
        "format" varchar(8) NOT NULL DEFAULT 'xlsx',
        "rangeDays" integer NOT NULL DEFAULT 30,
        "filters" jsonb NOT NULL DEFAULT '{}',
        "enabled" boolean NOT NULL DEFAULT true,
        "nextRunAt" timestamp NOT NULL,
        "lastRunAt" timestamp,
        "lastStatus" varchar(16),
        "lastError" text,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_report_schedules_due" ON "report_schedules" ("enabled", "nextRunAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "report_schedules"`);
    await q.query(`DROP TABLE IF EXISTS "dashboards"`);
  }
}
