import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationApprovalAccess1742000000000 implements MigrationInterface {
  name = 'OrganizationApprovalAccess1742000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "approvalStatus" VARCHAR(20) NOT NULL DEFAULT 'approved'
    `);
    await queryRunner.query(`
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "accessUntil" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      UPDATE "organizations"
      SET "accessUntil" = NOW() + INTERVAL '10 years',
          "approvedAt" = COALESCE("approvedAt", NOW())
      WHERE "approvalStatus" = 'approved' AND "accessUntil" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "approvedAt"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "accessUntil"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "approvalStatus"`);
  }
}
