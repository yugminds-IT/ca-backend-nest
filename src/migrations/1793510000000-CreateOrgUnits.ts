import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Units (places) above brands (business_units), and the layout an organization chose.
 *
 * - org_units: a unit has brands. Each organization gets one default unit named "Main unit".
 * - business_units.unitId: every existing brand is attached to its organization's default unit.
 * - user_org_units: staff assigned to a whole unit.
 * - organizations.unitStructure: existing organizations keep every capability (multi_unit),
 *   except those that already chose a single branch, which become one_unit_no_brand.
 *
 * Idempotent and additive: no existing row is deleted or renamed.
 */
export class CreateOrgUnits1793510000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "org_units" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "name" varchar(255) NOT NULL,
        "city" varchar(255),
        "isDefault" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_org_units_one_default" ON "org_units" ("organizationId") WHERE "isDefault" = true`,
    );
    await q.query(`
      CREATE TABLE IF NOT EXISTS "user_org_units" (
        "userId" integer NOT NULL,
        "orgUnitId" integer NOT NULL REFERENCES "org_units"("id") ON DELETE CASCADE,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "orgUnitId")
      )`);
    await q.query(`ALTER TABLE "business_units" ADD COLUMN IF NOT EXISTS "unitId" integer REFERENCES "org_units"("id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_business_units_unit" ON "business_units" ("unitId")`);
    await q.query(
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "unitStructure" varchar(30) NOT NULL DEFAULT 'multi_unit'`,
    );

    // One default unit for every organization that already has brands.
    await q.query(`
      INSERT INTO "org_units" ("organizationId", "name", "isDefault", "isActive")
      SELECT DISTINCT bu."organizationId", 'Main unit', true, true
      FROM "business_units" bu
      WHERE NOT EXISTS (SELECT 1 FROM "org_units" u WHERE u."organizationId" = bu."organizationId" AND u."isDefault" = true)`);
    await q.query(`
      UPDATE "business_units" bu
      SET "unitId" = u."id"
      FROM "org_units" u
      WHERE bu."unitId" IS NULL AND u."organizationId" = bu."organizationId" AND u."isDefault" = true`);

    // Organizations that already chose "single branch" keep that behaviour.
    await q.query(`UPDATE "organizations" SET "unitStructure" = 'one_unit_no_brand' WHERE "adminPanelEnabled" = false`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "unitStructure"`);
    await q.query(`DROP INDEX IF EXISTS "idx_business_units_unit"`);
    await q.query(`ALTER TABLE "business_units" DROP COLUMN IF EXISTS "unitId"`);
    await q.query(`DROP TABLE IF EXISTS "user_org_units"`);
    await q.query(`DROP TABLE IF EXISTS "org_units"`);
  }
}
