import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the lead pipeline: pipelines, stages, leads, activities and tasks.
 *
 * Every lead belongs to one business unit. Pipelines are per unit. Nothing existing is changed,
 * so this is safe to run on a live database. Idempotent (IF NOT EXISTS throughout).
 */
export class CreateLeads1792500000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "pipelines" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer NOT NULL REFERENCES "business_units"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "isDefault" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_pipelines_org_unit" ON "pipelines" ("organizationId", "businessUnitId")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pipelines_one_default_per_unit" ON "pipelines" ("organizationId", "businessUnitId") WHERE "isDefault" = true`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "pipeline_stages" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "pipelineId" integer NOT NULL REFERENCES "pipelines"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "probability" integer NOT NULL DEFAULT 0,
        "isWon" boolean NOT NULL DEFAULT false,
        "isLost" boolean NOT NULL DEFAULT false
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_pipeline_stages_pipeline_position" ON "pipeline_stages" ("pipelineId", "position")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "leads" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer NOT NULL REFERENCES "business_units"("id") ON DELETE CASCADE,
        "pipelineId" integer NOT NULL REFERENCES "pipelines"("id") ON DELETE RESTRICT,
        "stageId" integer NOT NULL REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT,
        "name" varchar(255) NOT NULL,
        "email" varchar(255),
        "phone" varchar(32),
        "company" varchar(255),
        "source" varchar(120),
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "value" numeric(14,2),
        "ownerUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "tags" jsonb NOT NULL DEFAULT '[]',
        "customData" jsonb NOT NULL DEFAULT '{}',
        "formSubmissionId" integer REFERENCES "form_submissions"("id") ON DELETE SET NULL,
        "lostReason" varchar(255),
        "nextFollowUpAt" timestamp,
        "lastActivityAt" timestamp,
        "closedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_leads_org_unit_status" ON "leads" ("organizationId", "businessUnitId", "status")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_leads_org_email" ON "leads" ("organizationId", "email")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_leads_org_phone" ON "leads" ("organizationId", "phone")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "lead_activities" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "leadId" integer NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
        "type" varchar(24) NOT NULL,
        "body" text,
        "createdByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_lead_activities_lead_created" ON "lead_activities" ("leadId", "createdAt")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "lead_tasks" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "leadId" integer NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
        "title" varchar(255) NOT NULL,
        "dueAt" timestamp,
        "assignedToUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "completedAt" timestamp,
        "createdByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_lead_tasks_org_due" ON "lead_tasks" ("organizationId", "dueAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "lead_tasks"`);
    await q.query(`DROP TABLE IF EXISTS "lead_activities"`);
    await q.query(`DROP TABLE IF EXISTS "leads"`);
    await q.query(`DROP TABLE IF EXISTS "pipeline_stages"`);
    await q.query(`DROP TABLE IF EXISTS "pipelines"`);
  }
}
