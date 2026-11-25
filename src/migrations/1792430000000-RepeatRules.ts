import { MigrationInterface, QueryRunner } from 'typeorm';

// Repeating emails beyond "these months on these days": weekly, start/end, a send limit,
// and everything a one-off send can carry (per-recipient values, Cc/Bcc, files, a group).
export class RepeatRules1792430000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_recurring_schedules"
        ADD COLUMN IF NOT EXISTS "weekdays" jsonb,
        ADD COLUMN IF NOT EXISTS "frequency" varchar(10),
        ADD COLUMN IF NOT EXISTS "startDate" date,
        ADD COLUMN IF NOT EXISTS "endDate" date,
        ADD COLUMN IF NOT EXISTS "maxSends" int,
        ADD COLUMN IF NOT EXISTS "sentCount" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "recipientVariables" jsonb,
        ADD COLUMN IF NOT EXISTS "cc" varchar(1000),
        ADD COLUMN IF NOT EXISTS "bcc" varchar(1000),
        ADD COLUMN IF NOT EXISTS "attachments" jsonb,
        ADD COLUMN IF NOT EXISTS "recipientAttachments" jsonb,
        ADD COLUMN IF NOT EXISTS "segment" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_recurring_schedules"
        DROP COLUMN "weekdays", DROP COLUMN "frequency", DROP COLUMN "startDate", DROP COLUMN "endDate",
        DROP COLUMN "maxSends", DROP COLUMN "sentCount", DROP COLUMN "recipientVariables", DROP COLUMN "cc",
        DROP COLUMN "bcc", DROP COLUMN "attachments", DROP COLUMN "recipientAttachments", DROP COLUMN "segment"`);
  }
}
