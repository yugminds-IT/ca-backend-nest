import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive: what happened to each recipient of a send, and a batch id tying together every send of one email
// (all time slots of a schedule, each month of a repeating email, and resends).
const BATCH_KEY = `md5(COALESCE("createdBy"::text, '') || '|' || COALESCE("templateId"::text, '') || '|' || COALESCE("subject", '') || '|' || date_trunc('second', "createdAt")::text)::uuid`;

export class AddDeliveriesAndBatches1792420000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_deliveries" (
        "id" SERIAL PRIMARY KEY,
        "scheduleId" int NOT NULL REFERENCES "email_schedules"("id") ON DELETE CASCADE,
        "email" varchar(320) NOT NULL,
        "status" varchar(20) NOT NULL,
        "reason" text NULL,
        "at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_email_deliveries_schedule_email" UNIQUE ("scheduleId", "email")
      )`);
    await queryRunner.query(`ALTER TABLE "email_schedules" ADD COLUMN IF NOT EXISTS "batchId" uuid NULL`);
    await queryRunner.query(`ALTER TABLE "email_recurring_schedules" ADD COLUMN IF NOT EXISTS "batchId" uuid NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_email_schedules_batch" ON "email_schedules" ("batchId")`);

    // Older rows: slots saved by one request share a creator, message and creation second
    await queryRunner.query(`UPDATE "email_recurring_schedules" SET "batchId" = ${BATCH_KEY} WHERE "batchId" IS NULL`);
    await queryRunner.query(`
      UPDATE "email_schedules" s SET "batchId" = r."batchId"
      FROM "email_recurring_schedules" r WHERE s."recurringScheduleId" = r.id AND s."batchId" IS NULL`);
    await queryRunner.query(`UPDATE "email_schedules" SET "batchId" = ${BATCH_KEY} WHERE "batchId" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_schedules_batch"`);
    await queryRunner.query(`ALTER TABLE "email_recurring_schedules" DROP COLUMN IF EXISTS "batchId"`);
    await queryRunner.query(`ALTER TABLE "email_schedules" DROP COLUMN IF EXISTS "batchId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_deliveries"`);
  }
}
