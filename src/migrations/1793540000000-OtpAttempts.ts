import { MigrationInterface, QueryRunner } from 'typeorm';

/** Counts wrong password-reset code guesses, so a code is thrown away after a few. */
export class OtpAttempts1793540000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "otps" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "otps" DROP COLUMN IF EXISTS "attempts"`);
  }
}
