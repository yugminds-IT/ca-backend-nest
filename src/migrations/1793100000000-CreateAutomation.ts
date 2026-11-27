import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Automation (Phase 7): assignment rules, workflow rules and run history, follow-up sequences and
 * enrollments, SLA policies, scoring rules, and the lead columns they read and write.
 *
 * Adds tables and nullable or defaulted columns only, so it is safe on a live database.
 * Idempotent (IF NOT EXISTS throughout).
 */
export class CreateAutomation1793100000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "assignment_rules" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer NOT NULL REFERENCES "business_units"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "strategy" varchar(20) NOT NULL,
        "priority" integer NOT NULL DEFAULT 100,
        "enabled" boolean NOT NULL DEFAULT true,
        "memberUserIds" jsonb NOT NULL DEFAULT '[]',
        "conditionField" varchar(40),
        "conditionValue" varchar(255),
        "targetUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "cursorUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_assignment_rules_org_unit" ON "assignment_rules" ("organizationId", "businessUnitId")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "workflow_rules" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer REFERENCES "business_units"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "trigger" varchar(32) NOT NULL,
        "triggerConfig" jsonb NOT NULL DEFAULT '{}',
        "conditions" jsonb NOT NULL DEFAULT '[]',
        "actions" jsonb NOT NULL DEFAULT '[]',
        "enabled" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_workflow_rules_org_trigger" ON "workflow_rules" ("organizationId", "trigger")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "workflow_runs" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "ruleId" integer NOT NULL REFERENCES "workflow_rules"("id") ON DELETE CASCADE,
        "leadId" integer NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
        "trigger" varchar(32) NOT NULL,
        "status" varchar(16) NOT NULL,
        "detail" text,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_workflow_runs_rule_lead" ON "workflow_runs" ("ruleId", "leadId")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "sequences" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer NOT NULL REFERENCES "business_units"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "stopOnStageChange" boolean NOT NULL DEFAULT true,
        "stopOnReply" boolean NOT NULL DEFAULT true,
        "steps" jsonb NOT NULL DEFAULT '[]',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_sequences_org_unit" ON "sequences" ("organizationId", "businessUnitId")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "sequence_enrollments" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "sequenceId" integer NOT NULL REFERENCES "sequences"("id") ON DELETE CASCADE,
        "leadId" integer NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
        "currentStep" integer NOT NULL DEFAULT 0,
        "nextStepAt" timestamp,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "stopReason" varchar(40),
        "enrolledByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_sequence_enrollments_due" ON "sequence_enrollments" ("status", "nextStepAt")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_sequence_enrollments_active" ON "sequence_enrollments" ("sequenceId", "leadId") WHERE "status" = 'active'`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "sla_policies" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer NOT NULL REFERENCES "business_units"("id") ON DELETE CASCADE,
        "enabled" boolean NOT NULL DEFAULT true,
        "firstResponseMinutes" integer NOT NULL DEFAULT 60,
        "escalateToUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ix_sla_policies_org_unit" ON "sla_policies" ("organizationId", "businessUnitId")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "scoring_rules" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer NOT NULL REFERENCES "business_units"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "field" varchar(60) NOT NULL,
        "op" varchar(12) NOT NULL,
        "value" varchar(255),
        "points" integer NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "ix_scoring_rules_org_unit" ON "scoring_rules" ("organizationId", "businessUnitId")`,
    );

    await q.query(`ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "score" integer NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "firstResponseDueAt" timestamp`);
    await q.query(`ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "firstRespondedAt" timestamp`);
    await q.query(`ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "slaEscalatedAt" timestamp`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "slaEscalatedAt"`);
    await q.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "firstRespondedAt"`);
    await q.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "firstResponseDueAt"`);
    await q.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "score"`);
    await q.query(`DROP TABLE IF EXISTS "scoring_rules"`);
    await q.query(`DROP TABLE IF EXISTS "sla_policies"`);
    await q.query(`DROP TABLE IF EXISTS "sequence_enrollments"`);
    await q.query(`DROP TABLE IF EXISTS "sequences"`);
    await q.query(`DROP TABLE IF EXISTS "workflow_runs"`);
    await q.query(`DROP TABLE IF EXISTS "workflow_rules"`);
    await q.query(`DROP TABLE IF EXISTS "assignment_rules"`);
  }
}
