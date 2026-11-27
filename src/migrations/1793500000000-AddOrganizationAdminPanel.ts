import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Whether an organization runs with an admin panel (several brands, staff assigned to brands)
 * or as a single branch where every employee sees the data directly. Chosen at signup.
 *
 * Existing organizations default to true, so they keep the multi-brand behaviour they have today.
 * Idempotent (IF NOT EXISTS) and adds one column, so existing data is untouched.
 */
export class AddOrganizationAdminPanel1793500000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "adminPanelEnabled" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "adminPanelEnabled"`);
  }
}
