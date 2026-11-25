import { MigrationInterface, QueryRunner } from 'typeorm';

// Bulk sends are queued as one email_schedules row: per-recipient variables, CC/BCC,
// and a progress counter so an interrupted send resumes instead of starting over.
export class AddBulkSendToEmailSchedules1792350000000 implements MigrationInterface {
  name = 'AddBulkSendToEmailSchedules1792350000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "email_schedules" ADD COLUMN IF NOT EXISTS "recipientVariables" jsonb`);
    await q.query(`ALTER TABLE "email_schedules" ADD COLUMN IF NOT EXISTS "cc" varchar(1000)`);
    await q.query(`ALTER TABLE "email_schedules" ADD COLUMN IF NOT EXISTS "bcc" varchar(1000)`);
    await q.query(`ALTER TABLE "email_schedules" ADD COLUMN IF NOT EXISTS "progress" integer NOT NULL DEFAULT 0`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "email_schedules" DROP COLUMN IF EXISTS "progress"`);
    await q.query(`ALTER TABLE "email_schedules" DROP COLUMN IF EXISTS "bcc"`);
    await q.query(`ALTER TABLE "email_schedules" DROP COLUMN IF EXISTS "cc"`);
    await q.query(`ALTER TABLE "email_schedules" DROP COLUMN IF EXISTS "recipientVariables"`);
  }
}
