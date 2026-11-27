import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marks the brand the system created on its own (the default one, named after the organization),
 * so the first brand an admin adds can take it over instead of sitting beside it.
 * Brands already renamed by someone are left unmarked.
 */
export class BusinessUnitPlaceholder1793530000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "business_units" ADD COLUMN IF NOT EXISTS "isPlaceholder" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `UPDATE "business_units" b SET "isPlaceholder" = true
         FROM "organizations" o
        WHERE b."organizationId" = o."id" AND b."isDefault" = true AND b."name" = o."name"`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "business_units" DROP COLUMN IF EXISTS "isPlaceholder"`);
  }
}
