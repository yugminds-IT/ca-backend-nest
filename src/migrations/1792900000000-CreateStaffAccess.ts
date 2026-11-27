import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permission profiles, unit memberships for staff, staff invites, and an active flag on users.
 *
 * Existing staff get no profile (they keep their current access until one is assigned) and are active.
 * Idempotent.
 */
export class CreateStaffAccess1792900000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "permission_profiles" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL,
        "description" varchar(300),
        "permissions" jsonb NOT NULL DEFAULT '[]',
        "dataScope" varchar(10) NOT NULL DEFAULT 'own',
        "isPreset" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_permission_profiles_org_name" ON "permission_profiles" ("organizationId", "name")`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "user_business_units" (
        "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "businessUnitId" integer NOT NULL REFERENCES "business_units"("id") ON DELETE CASCADE,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY ("userId", "businessUnitId")
      )
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "staff_invites" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tokenHash" varchar(64) NOT NULL,
        "expiresAt" timestamp NOT NULL,
        "acceptedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_staff_invites_tokenHash" ON "staff_invites" ("tokenHash")`);

    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profileId" integer REFERENCES "permission_profiles"("id") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "isActive"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "profileId"`);
    await q.query(`DROP TABLE IF EXISTS "staff_invites"`);
    await q.query(`DROP TABLE IF EXISTS "user_business_units"`);
    await q.query(`DROP TABLE IF EXISTS "permission_profiles"`);
  }
}
