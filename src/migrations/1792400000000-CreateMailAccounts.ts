import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

/**
 * Creates `mail_accounts`: per-unit SMTP accounts with an organization-wide fallback.
 *
 * Existing organizations keep sending through their legacy SMTP columns on `organizations`
 * (the last step of the resolver). No data is copied, so this migration cannot break current mail.
 *
 * Partial unique indexes allow at most one active account per unit and one organization-wide account.
 * Idempotent: safe to re-run.
 */
export class CreateMailAccounts1792400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('mail_accounts'))) {
      await queryRunner.createTable(
        new Table({
          name: 'mail_accounts',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            { name: 'organizationId', type: 'int' },
            { name: 'businessUnitId', type: 'int', isNullable: true },
            { name: 'label', type: 'varchar', length: '255' },
            { name: 'host', type: 'varchar', length: '255' },
            { name: 'port', type: 'int', default: 587 },
            { name: 'secure', type: 'boolean', default: false },
            { name: 'username', type: 'varchar', length: '255' },
            { name: 'passwordEncrypted', type: 'text' },
            { name: 'fromEmail', type: 'varchar', length: '255' },
            {
              name: 'fromName',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            { name: 'whiteLabel', type: 'boolean', default: false },
            { name: 'isActive', type: 'boolean', default: true },
            { name: 'lastVerifiedAt', type: 'timestamp', isNullable: true },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
          ],
        }),
      );
    }

    const table = await queryRunner.getTable('mail_accounts');
    const hasFk = (column: string) =>
      table?.foreignKeys.some((fk) => fk.columnNames.includes(column));
    if (!hasFk('organizationId')) {
      await queryRunner.createForeignKey(
        'mail_accounts',
        new TableForeignKey({
          columnNames: ['organizationId'],
          referencedTableName: 'organizations',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
    if (!hasFk('businessUnitId')) {
      await queryRunner.createForeignKey(
        'mail_accounts',
        new TableForeignKey({
          columnNames: ['businessUnitId'],
          referencedTableName: 'business_units',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_mail_accounts_one_active_org_wide"
         ON "mail_accounts" ("organizationId")
         WHERE "isActive" = true AND "businessUnitId" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_mail_accounts_one_active_per_unit"
         ON "mail_accounts" ("organizationId", "businessUnitId")
         WHERE "isActive" = true AND "businessUnitId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_mail_accounts_one_active_per_unit"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_mail_accounts_one_active_org_wide"`,
    );
    await queryRunner.dropTable('mail_accounts', true);
  }
}
