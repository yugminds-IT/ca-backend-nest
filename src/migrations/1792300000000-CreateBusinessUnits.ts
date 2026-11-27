import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

/**
 * Adds business units (brands or branches inside an organization).
 *
 * - Creates `business_units`.
 * - Creates one default unit per existing organization (named and slugged after the org).
 * - Adds a nullable `businessUnitId` to tenant tables and backfills it to the org's default unit.
 *   Global email templates (organizationId NULL) keep businessUnitId NULL.
 *
 * Idempotent: safe to re-run after a partial failure.
 */
const TENANT_TABLES = [
  'clients',
  'form_submissions',
  'api_keys',
  'email_templates',
  'email_logs',
  'email_schedules',
  'contacts',
  'contact_lists',
];

export class CreateBusinessUnits1792300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('business_units'))) {
      await queryRunner.createTable(
        new Table({
          name: 'business_units',
          columns: [
            { name: 'id', type: 'serial', isPrimary: true },
            { name: 'organizationId', type: 'int' },
            { name: 'name', type: 'varchar', length: '255' },
            { name: 'slug', type: 'varchar', length: '100' },
            { name: 'logoUrl', type: 'varchar', length: '500', isNullable: true },
            { name: 'brandColor', type: 'varchar', length: '20', isNullable: true },
            { name: 'timezone', type: 'varchar', length: '60', default: "'Asia/Kolkata'" },
            { name: 'isDefault', type: 'boolean', default: false },
            { name: 'isActive', type: 'boolean', default: true },
            { name: 'businessProfileEnabled', type: 'boolean', default: false },
            { name: 'legalName', type: 'varchar', length: '255', isNullable: true },
            { name: 'gstin', type: 'varchar', length: '15', isNullable: true },
            { name: 'pan', type: 'varchar', length: '10', isNullable: true },
            { name: 'address', type: 'text', isNullable: true },
            { name: 'invoicePrefix', type: 'varchar', length: '20', isNullable: true },
            { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          ],
        }),
      );
      await queryRunner.createForeignKey(
        'business_units',
        new TableForeignKey({
          columnNames: ['organizationId'],
          referencedTableName: 'organizations',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS "uq_business_units_org_slug" ON "business_units" ("organizationId", "slug")',
      );
      await queryRunner.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS "uq_business_units_one_default" ON "business_units" ("organizationId") WHERE "isDefault" = true',
      );
    }

    // One default unit per organization that does not have one yet.
    await queryRunner.query(`
      INSERT INTO "business_units" ("organizationId", "name", "slug", "isDefault", "isActive")
      SELECT o."id", o."name", o."slug", true, true
      FROM "organizations" o
      WHERE NOT EXISTS (
        SELECT 1 FROM "business_units" b WHERE b."organizationId" = o."id" AND b."isDefault" = true
      )
    `);

    for (const table of TENANT_TABLES) {
      if (!(await queryRunner.hasTable(table))) continue;
      if (!(await queryRunner.hasColumn(table, 'organizationId'))) continue;

      if (!(await queryRunner.hasColumn(table, 'businessUnitId'))) {
        await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "businessUnitId" int NULL`);
        await queryRunner.createForeignKey(
          table,
          new TableForeignKey({
            columnNames: ['businessUnitId'],
            referencedTableName: 'business_units',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        );
        await queryRunner.query(
          `CREATE INDEX IF NOT EXISTS "idx_${table}_business_unit" ON "${table}" ("businessUnitId")`,
        );
      }

      await queryRunner.query(`
        UPDATE "${table}" t
        SET "businessUnitId" = b."id"
        FROM "business_units" b
        WHERE b."organizationId" = t."organizationId"
          AND b."isDefault" = true
          AND t."businessUnitId" IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TENANT_TABLES) {
      if (!(await queryRunner.hasTable(table))) continue;
      if (!(await queryRunner.hasColumn(table, 'businessUnitId'))) continue;
      const fk = (await queryRunner.getTable(table))?.foreignKeys.find((f) =>
        f.columnNames.includes('businessUnitId'),
      );
      if (fk) await queryRunner.dropForeignKey(table, fk);
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_${table}_business_unit"`);
      await queryRunner.dropColumn(table, 'businessUnitId');
    }
    await queryRunner.query('DROP INDEX IF EXISTS "uq_business_units_one_default"');
    await queryRunner.query('DROP INDEX IF EXISTS "uq_business_units_org_slug"');
    if (await queryRunner.hasTable('business_units')) {
      await queryRunner.dropTable('business_units');
    }
  }
}
