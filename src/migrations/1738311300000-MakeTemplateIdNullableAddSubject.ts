import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeTemplateIdNullableAddSubject1738311300000 implements MigrationInterface {
  name = 'MakeTemplateIdNullableAddSubject1738311300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Allow templateId to be NULL so custom emails (no template) can be logged
    await queryRunner.query(`ALTER TABLE "email_schedules" ALTER COLUMN "templateId" DROP NOT NULL`);
    // Add subject column to store subject for custom emails (and optionally template-based ones)
    await queryRunner.query(`ALTER TABLE "email_schedules" ADD COLUMN IF NOT EXISTS "subject" VARCHAR(500)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_schedules" DROP COLUMN IF EXISTS "subject"`);
    await queryRunner.query(`ALTER TABLE "email_schedules" ALTER COLUMN "templateId" SET NOT NULL`);
  }
}
