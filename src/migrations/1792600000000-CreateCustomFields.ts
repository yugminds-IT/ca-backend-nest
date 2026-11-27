import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Custom fields and custom variables.
 *
 * - custom_field_definitions: per business unit, per entity (today: leads). Values go in customData.
 * - custom_variables: org-wide (or unit-scoped) variables for email templates, e.g. {{meeting_link}}.
 * - custom_variable_values: per-client value for a variable. A missing row means "use the default".
 *
 * Idempotent (IF NOT EXISTS). Creates new tables only, so existing data is untouched.
 */
export class CreateCustomFields1792600000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "custom_field_definitions" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer NOT NULL REFERENCES "business_units"("id") ON DELETE CASCADE,
        "entityType" varchar(24) NOT NULL DEFAULT 'lead',
        "key" varchar(64) NOT NULL,
        "label" varchar(120) NOT NULL,
        "fieldType" varchar(24) NOT NULL,
        "options" jsonb NOT NULL DEFAULT '[]',
        "required" boolean NOT NULL DEFAULT false,
        "position" integer NOT NULL DEFAULT 0,
        "section" varchar(80) NOT NULL DEFAULT 'Details',
        "helpText" varchar(255),
        "showIfKey" varchar(64),
        "showIfValue" varchar(255),
        "visibleToRoles" jsonb NOT NULL DEFAULT '[]',
        "editableByRoles" jsonb NOT NULL DEFAULT '[]',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_custom_field_key" ON "custom_field_definitions" ("organizationId", "businessUnitId", "entityType", "key")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "custom_variables" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "businessUnitId" integer REFERENCES "business_units"("id") ON DELETE CASCADE,
        "key" varchar(64) NOT NULL,
        "label" varchar(255) NOT NULL,
        "defaultValue" text NOT NULL DEFAULT '',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_custom_variables_org_key" ON "custom_variables" ("organizationId", "key")`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "custom_variable_values" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL,
        "variableId" integer NOT NULL REFERENCES "custom_variables"("id") ON DELETE CASCADE,
        "clientId" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
        "value" text NOT NULL,
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_custom_variable_values" ON "custom_variable_values" ("variableId", "clientId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "custom_variable_values"`);
    await q.query(`DROP TABLE IF EXISTS "custom_variables"`);
    await q.query(`DROP TABLE IF EXISTS "custom_field_definitions"`);
  }
}
