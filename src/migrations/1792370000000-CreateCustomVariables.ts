import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive only: two new tables, nothing existing is altered.
export class CreateCustomVariables1792370000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "custom_variables" (
        "id" SERIAL PRIMARY KEY,
        "organizationId" int NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "key" varchar(60) NOT NULL,
        "label" varchar(100) NOT NULL,
        "defaultValue" text NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_custom_variables_org_key" UNIQUE ("organizationId", "key")
      )`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_custom_values" (
        "id" SERIAL PRIMARY KEY,
        "clientId" int NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
        "variableId" int NOT NULL REFERENCES "custom_variables"("id") ON DELETE CASCADE,
        "value" text NOT NULL,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_client_custom_values_client_var" UNIQUE ("clientId", "variableId")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_client_custom_values_variable" ON "client_custom_values" ("variableId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "client_custom_values"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "custom_variables"`);
  }
}
