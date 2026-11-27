import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan entitlements and per-tenant module overrides (Phase 10).
 * Existing organizations are grandfathered onto Enterprise so nothing they use stops working.
 * New organizations get a Starter row the first time billing is read. Idempotent.
 */
export class CreateBilling1793400000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "org_billing" (
        "organizationId" integer PRIMARY KEY REFERENCES "organizations"("id") ON DELETE CASCADE,
        "planKey" varchar(20) NOT NULL DEFAULT 'starter',
        "moduleOverrides" jsonb NOT NULL DEFAULT '{}',
        "aiCreditsUsed" integer NOT NULL DEFAULT 0,
        "aiPeriod" varchar(7) NOT NULL DEFAULT '',
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`
      INSERT INTO "org_billing" ("organizationId", "planKey")
      SELECT o."id", 'enterprise' FROM "organizations" o
      ON CONFLICT ("organizationId") DO NOTHING`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "org_billing"`);
  }
}
