import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive only: saved contact groups, and a bulk send that targets one (resolved when it goes out).
export class CreateSegments1792400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "segments" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" int NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "name" varchar(80) NOT NULL,
        "rules" jsonb NOT NULL DEFAULT '[]',
        "createdBy" int NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_segments_org_name" UNIQUE ("organizationId", "name")
      )`);
    await queryRunner.query(`ALTER TABLE "email_schedules" ADD COLUMN IF NOT EXISTS "segment" jsonb NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_schedules" DROP COLUMN IF EXISTS "segment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "segments"`);
  }
}
