import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive only: a tags list on each client (any industry's labels: "VIP", "Class 10", "Cardiology").
export class AddTagsToClients1792390000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_clients_tags" ON "clients" USING GIN ("tags")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clients_tags"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN IF EXISTS "tags"`);
  }
}
