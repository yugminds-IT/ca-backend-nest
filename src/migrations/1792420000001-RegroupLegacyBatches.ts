import { MigrationInterface, QueryRunner } from 'typeorm';

// Older rows were saved one insert at a time, so one request's rows can span several seconds.
// Regroup the rows the previous migration grouped by second: same creator, template and subject,
// each created within 60 s of the one before. Rows created since (random batch ids) are left alone.
const KEY = `"createdBy"::text || '|' || COALESCE("templateId"::text, '') || '|' || COALESCE("subject", '')`;
const BY_SECOND = `md5(${KEY} || '|' || date_trunc('second', "createdAt")::text)::uuid`;

const regroup = (table: string, extraWhere = '') => `
  WITH legacy AS (
    SELECT id, ${KEY} AS k, "createdAt" FROM "${table}" WHERE "batchId" = ${BY_SECOND} ${extraWhere}
  ), starts AS (
    SELECT id, k, "createdAt",
      CASE WHEN lag("createdAt") OVER w IS NULL OR "createdAt" - lag("createdAt") OVER w > interval '60 seconds' THEN 1 ELSE 0 END AS s
    FROM legacy WINDOW w AS (PARTITION BY k ORDER BY "createdAt", id)
  ), groups AS (
    SELECT id, md5(k || '|run|' || sum(s) OVER (PARTITION BY k ORDER BY "createdAt", id))::uuid AS b FROM starts
  )
  UPDATE "${table}" t SET "batchId" = g.b FROM groups g WHERE t.id = g.id`;

export class RegroupLegacyBatches1792420000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(regroup('email_recurring_schedules'));
    await queryRunner.query(regroup('email_schedules', `AND "recurringScheduleId" IS NULL`));
    await queryRunner.query(`
      UPDATE "email_schedules" s SET "batchId" = r."batchId"
      FROM "email_recurring_schedules" r WHERE s."recurringScheduleId" = r.id`);
  }

  public async down(): Promise<void> {
    // Grouping only; nothing to undo
  }
}
