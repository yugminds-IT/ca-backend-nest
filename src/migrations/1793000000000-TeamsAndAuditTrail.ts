import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Teams with a manager and a parent team, a team on each user, and an audit trail for staff and access
 * changes. Existing users get no team. Idempotent.
 */
export class TeamsAndAuditTrail1793000000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "teams" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL,
        "parentTeamId" integer REFERENCES "teams"("id") ON DELETE SET NULL,
        "managerUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_teams_org_name" ON "teams" ("organizationId", "name")`);

    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "teamId" integer REFERENCES "teams"("id") ON DELETE SET NULL`,
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "audit_events" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "actorUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "actorName" varchar(255),
        "action" varchar(60) NOT NULL,
        "targetType" varchar(40),
        "targetId" integer,
        "summary" varchar(500) NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_events_org_created" ON "audit_events" ("organizationId", "createdAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "audit_events"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "teamId"`);
    await q.query(`DROP TABLE IF EXISTS "teams"`);
  }
}
