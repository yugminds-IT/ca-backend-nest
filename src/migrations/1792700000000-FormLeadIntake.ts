import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Form responses can create leads.
 *
 * - api_keys.autoCreateLead: when true, each accepted form submission on that key also creates a lead
 *   in the key's business unit. Defaults to false, so existing keys keep their current behavior.
 *
 * Idempotent. Adds one column with a default, so existing rows are untouched.
 */
export class FormLeadIntake1792700000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "autoCreateLead" boolean NOT NULL DEFAULT false`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "autoCreateLead"`);
  }
}
