import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

/**
 * Drops all existing UUID-based tables and recreates them with sequential integer IDs (SERIAL).
 * All IDs will be 1, 2, 3, ... for roles, organizations, users, clients, etc.
 * WARNING: Destructive – all existing data will be lost. Run only on empty or disposable DB.
 */
export class SwitchToSequentialIntegerIds1738310900000 implements MigrationInterface {
  name = 'SwitchToSequentialIntegerIds1738310900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order
    await queryRunner.dropTable('client_files', true);
    await queryRunner.dropTable('otps', true);
    await queryRunner.dropTable('client_directors', true);
    await queryRunner.dropTable('client_services', true);
    await queryRunner.dropTable('clients', true);
    await queryRunner.dropTable('users', true);
    await queryRunner.dropTable('business_types', true);
    await queryRunner.dropTable('services', true);
    await queryRunner.dropTable('organizations', true);
    await queryRunner.dropTable('roles', true);

    // ---- roles ----
    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'name', type: 'varchar', length: '50', isUnique: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    // ---- organizations ----
    await queryRunner.createTable(
      new Table({
        name: 'organizations',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'slug', type: 'varchar', length: '100', isUnique: true },
          { name: 'city', type: 'varchar', length: '100', isNullable: true },
          { name: 'state', type: 'varchar', length: '100', isNullable: true },
          { name: 'country', type: 'varchar', length: '100', isNullable: true },
          { name: 'pincode', type: 'varchar', length: '20', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    // ---- users ----
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'email', type: 'varchar', length: '255', isUnique: true },
          { name: 'name', type: 'varchar', length: '255', isNullable: true },
          { name: 'phone', type: 'varchar', length: '50', isNullable: true },
          { name: 'passwordHash', type: 'varchar', length: '255' },
          { name: 'roleId', type: 'int' },
          { name: 'organizationId', type: 'int', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          { columnNames: ['roleId'], referencedTableName: 'roles', referencedColumnNames: ['id'], onDelete: 'RESTRICT' },
          { columnNames: ['organizationId'], referencedTableName: 'organizations', referencedColumnNames: ['id'], onDelete: 'SET NULL' },
        ],
      }),
      true,
    );

    // ---- clients ----
    await queryRunner.createTable(
      new Table({
        name: 'clients',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'organizationId', type: 'int' },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'email', type: 'varchar', length: '255', isNullable: true },
          { name: 'phone', type: 'varchar', length: '50', isNullable: true },
          { name: 'userId', type: 'int', isNullable: true },
          { name: 'companyName', type: 'varchar', length: '255', isNullable: true },
          { name: 'businessTypeId', type: 'int', isNullable: true },
          { name: 'panNumber', type: 'varchar', length: '20', isNullable: true },
          { name: 'gstNumber', type: 'varchar', length: '50', isNullable: true },
          { name: 'status', type: 'varchar', length: '20', isNullable: true, default: "'active'" },
          { name: 'address', type: 'varchar', length: '500', isNullable: true },
          { name: 'city', type: 'varchar', length: '100', isNullable: true },
          { name: 'state', type: 'varchar', length: '100', isNullable: true },
          { name: 'country', type: 'varchar', length: '100', isNullable: true },
          { name: 'pincode', type: 'varchar', length: '20', isNullable: true },
          { name: 'onboardDate', type: 'date', isNullable: true },
          { name: 'followupDate', type: 'date', isNullable: true },
          { name: 'additionalNotes', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          { columnNames: ['organizationId'], referencedTableName: 'organizations', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['userId'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'SET NULL' },
        ],
      }),
      true,
    );

    // ---- business_types ----
    await queryRunner.createTable(
      new Table({
        name: 'business_types',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'organizationId', type: 'int', isNullable: true },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          { columnNames: ['organizationId'], referencedTableName: 'organizations', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    // ---- services ----
    await queryRunner.createTable(
      new Table({
        name: 'services',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'organizationId', type: 'int', isNullable: true },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          { columnNames: ['organizationId'], referencedTableName: 'organizations', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    // ---- client_services (M:N) ----
    await queryRunner.createTable(
      new Table({
        name: 'client_services',
        columns: [
          { name: 'clientId', type: 'int', isPrimary: true },
          { name: 'serviceId', type: 'int', isPrimary: true },
        ],
        foreignKeys: [
          { columnNames: ['clientId'], referencedTableName: 'clients', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['serviceId'], referencedTableName: 'services', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    // ---- clients.businessTypeId FK (after business_types exists) ----
    await queryRunner.createForeignKey(
      'clients',
      new TableForeignKey({
        columnNames: ['businessTypeId'],
        referencedTableName: 'business_types',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // ---- client_directors ----
    await queryRunner.createTable(
      new Table({
        name: 'client_directors',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'clientId', type: 'int' },
          { name: 'directorName', type: 'varchar', length: '255' },
          { name: 'email', type: 'varchar', length: '255', isNullable: true },
          { name: 'phone', type: 'varchar', length: '50', isNullable: true },
          { name: 'designation', type: 'varchar', length: '100', isNullable: true },
          { name: 'din', type: 'varchar', length: '50', isNullable: true },
          { name: 'pan', type: 'varchar', length: '20', isNullable: true },
          { name: 'aadharNumber', type: 'varchar', length: '20', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          { columnNames: ['clientId'], referencedTableName: 'clients', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    // ---- otps ----
    await queryRunner.createTable(
      new Table({
        name: 'otps',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'email', type: 'varchar', length: '255' },
          { name: 'otp', type: 'varchar', length: '10' },
          { name: 'type', type: 'varchar', length: '50', default: "'password_reset'" },
          { name: 'expiresAt', type: 'timestamp' },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.query(`CREATE INDEX "IDX_otps_email_type" ON "otps" ("email", "type")`);

    // ---- client_files ----
    await queryRunner.createTable(
      new Table({
        name: 'client_files',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'clientId', type: 'int' },
          { name: 'fileName', type: 'varchar', length: '255' },
          { name: 'type', type: 'varchar', length: '100', isNullable: true },
          { name: 'format', type: 'varchar', length: '20' },
          { name: 'mimeType', type: 'varchar', length: '100', isNullable: true },
          { name: 'fileSize', type: 'int', isNullable: true },
          { name: 's3Key', type: 'varchar', length: '500' },
          { name: 's3Bucket', type: 'varchar', length: '255' },
          { name: 'uploadedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          { columnNames: ['clientId'], referencedTableName: 'clients', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    // ---- Seed data: roles (1,2,3,4,5) ----
    await queryRunner.query(`
      INSERT INTO roles (name) VALUES
        ('MASTER_ADMIN'),
        ('ORG_ADMIN'),
        ('CAA'),
        ('ORG_EMPLOYEE'),
        ('CLIENT')
    `);

    // ---- Seed data: business_types (1..5) ----
    await queryRunner.query(`
      INSERT INTO business_types ("organizationId", name) VALUES
        (NULL, 'LLP'),
        (NULL, 'Private Limited'),
        (NULL, 'Individual'),
        (NULL, 'Partnership'),
        (NULL, 'Other')
    `);

    // ---- Seed data: services (1..8) ----
    await queryRunner.query(`
      INSERT INTO services ("organizationId", name) VALUES
        (NULL, 'TDS returns'),
        (NULL, 'Audit service'),
        (NULL, 'Company registration'),
        (NULL, 'Compliances'),
        (NULL, 'GST filling'),
        (NULL, 'Income tax filling'),
        (NULL, 'Tax planning'),
        (NULL, 'Other')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting would require recreating UUID tables; not implemented.
    // To roll back, restore from backup or re-run the original UUID migrations.
    throw new Error('Down migration not supported. Restore from backup or re-run initial migrations.');
  }
}
