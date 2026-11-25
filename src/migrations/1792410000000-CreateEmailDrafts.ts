import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive only: unsent emails saved on the server instead of one per browser.
export class CreateEmailDrafts1792410000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_drafts" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" int NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "createdBy" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" varchar(200) NOT NULL,
        "data" jsonb NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_email_drafts_creator" ON "email_drafts" ("createdBy", "updatedAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_drafts"`);
  }
}
