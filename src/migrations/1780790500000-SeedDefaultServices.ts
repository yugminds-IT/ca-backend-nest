import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_SERVICES = [
  'ROC filings',
  'DIN KYC',
  'Annual Filling',
  'GST Tax Auditor',
  'Tax Audit',
];

export class SeedDefaultServices1780790500000 implements MigrationInterface {
  name = 'SeedDefaultServices1780790500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const name of DEFAULT_SERVICES) {
      const escaped = name.replace(/'/g, "''")
      await queryRunner.query(
        `INSERT INTO services ("organizationId", name)
         SELECT NULL, '${escaped}'
         WHERE NOT EXISTS (
           SELECT 1 FROM services WHERE name = '${escaped}' AND "organizationId" IS NULL
         )`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of DEFAULT_SERVICES) {
      const escaped = name.replace(/'/g, "''")
      await queryRunner.query(
        `DELETE FROM services WHERE name = '${escaped}' AND "organizationId" IS NULL`,
      );
    }
  }
}
