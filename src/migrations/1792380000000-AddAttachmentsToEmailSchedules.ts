import { MigrationInterface, QueryRunner } from 'typeorm';

// Files attached to a send: shared ones, and per recipient (keyed by email). Both hold S3 refs.
export class AddAttachmentsToEmailSchedules1792380000000 implements MigrationInterface {
  name = 'AddAttachmentsToEmailSchedules1792380000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "email_schedules" ADD COLUMN IF NOT EXISTS "attachments" jsonb`);
    await q.query(`ALTER TABLE "email_schedules" ADD COLUMN IF NOT EXISTS "recipientAttachments" jsonb`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "email_schedules" DROP COLUMN IF EXISTS "recipientAttachments"`);
    await q.query(`ALTER TABLE "email_schedules" DROP COLUMN IF EXISTS "attachments"`);
  }
}
