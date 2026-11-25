import { MigrationInterface, QueryRunner } from 'typeorm';

// Draft times carry their time zone. Plain "timestamp" columns get now() in the database's zone while the
// app reads them as UTC, which shifts them (5.5 h on an IST database).
export class EmailDraftsTimestamptz1792410000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_drafts"
        ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE current_setting('TimeZone'),
        ALTER COLUMN "updatedAt" TYPE timestamptz USING "updatedAt" AT TIME ZONE current_setting('TimeZone')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_drafts"
        ALTER COLUMN "createdAt" TYPE timestamp USING "createdAt" AT TIME ZONE current_setting('TimeZone'),
        ALTER COLUMN "updatedAt" TYPE timestamp USING "updatedAt" AT TIME ZONE current_setting('TimeZone')`);
  }
}
