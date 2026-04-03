import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSmtpConfigToOrganizations1738311400000 implements MigrationInterface {
  name = 'AddSmtpConfigToOrganizations1738311400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "smtpHost" VARCHAR(255)`);
    await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "smtpPort" INTEGER`);
    await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "smtpSecure" BOOLEAN`);
    await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "smtpUser" VARCHAR(255)`);
    await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "smtpPass" VARCHAR(1000)`);
    await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "smtpFrom" VARCHAR(255)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "smtpFrom"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "smtpPass"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "smtpUser"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "smtpSecure"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "smtpPort"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "smtpHost"`);
  }
}
