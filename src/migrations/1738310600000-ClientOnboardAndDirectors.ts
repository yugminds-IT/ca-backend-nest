import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class ClientOnboardAndDirectors1738310600000 implements MigrationInterface {
  name = 'ClientOnboardAndDirectors1738310600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'business_types',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'organizationId', type: 'uuid', isNullable: true },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'business_types',
      new TableForeignKey({
        columnNames: ['organizationId'],
        referencedTableName: 'organizations',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'services',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'organizationId', type: 'uuid', isNullable: true },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'services',
      new TableForeignKey({
        columnNames: ['organizationId'],
        referencedTableName: 'organizations',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.addColumns('clients', [
      new TableColumn({ name: 'companyName', type: 'varchar', length: '255', isNullable: true }),
      new TableColumn({ name: 'businessTypeId', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'panNumber', type: 'varchar', length: '20', isNullable: true }),
      new TableColumn({ name: 'gstNumber', type: 'varchar', length: '50', isNullable: true }),
      new TableColumn({
        name: 'status',
        type: 'varchar',
        length: '20',
        isNullable: true,
        default: "'active'",
      }),
      new TableColumn({ name: 'address', type: 'varchar', length: '500', isNullable: true }),
      new TableColumn({ name: 'city', type: 'varchar', length: '100', isNullable: true }),
      new TableColumn({ name: 'state', type: 'varchar', length: '100', isNullable: true }),
      new TableColumn({ name: 'country', type: 'varchar', length: '100', isNullable: true }),
      new TableColumn({ name: 'pincode', type: 'varchar', length: '20', isNullable: true }),
      new TableColumn({ name: 'onboardDate', type: 'date', isNullable: true }),
      new TableColumn({ name: 'followupDate', type: 'date', isNullable: true }),
      new TableColumn({ name: 'additionalNotes', type: 'text', isNullable: true }),
    ]);
    await queryRunner.createForeignKey(
      'clients',
      new TableForeignKey({
        columnNames: ['businessTypeId'],
        referencedTableName: 'business_types',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'client_services',
        columns: [
          { name: 'clientId', type: 'uuid', isPrimary: true },
          { name: 'serviceId', type: 'uuid', isPrimary: true },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'client_services',
      new TableForeignKey({
        columnNames: ['clientId'],
        referencedTableName: 'clients',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'client_services',
      new TableForeignKey({
        columnNames: ['serviceId'],
        referencedTableName: 'services',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'client_directors',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'clientId', type: 'uuid' },
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
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'client_directors',
      new TableForeignKey({
        columnNames: ['clientId'],
        referencedTableName: 'clients',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.query(`
      INSERT INTO business_types (id, "organizationId", name) VALUES
        (uuid_generate_v4(), NULL, 'LLP'),
        (uuid_generate_v4(), NULL, 'Private Limited'),
        (uuid_generate_v4(), NULL, 'Individual'),
        (uuid_generate_v4(), NULL, 'Partnership'),
        (uuid_generate_v4(), NULL, 'Other')
    `);
    await queryRunner.query(`
      INSERT INTO services (id, "organizationId", name) VALUES
        (uuid_generate_v4(), NULL, 'TDS returns'),
        (uuid_generate_v4(), NULL, 'Audit service'),
        (uuid_generate_v4(), NULL, 'Company registration'),
        (uuid_generate_v4(), NULL, 'Compliances'),
        (uuid_generate_v4(), NULL, 'GST filling'),
        (uuid_generate_v4(), NULL, 'Income tax filling'),
        (uuid_generate_v4(), NULL, 'Tax planning'),
        (uuid_generate_v4(), NULL, 'Other')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('client_directors', true);
    await queryRunner.dropTable('client_services', true);
    const clientFk = (await queryRunner.getTable('clients'))?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('businessTypeId') !== -1,
    );
    if (clientFk) await queryRunner.dropForeignKey('clients', clientFk);
    await queryRunner.dropColumn('clients', 'additionalNotes');
    await queryRunner.dropColumn('clients', 'followupDate');
    await queryRunner.dropColumn('clients', 'onboardDate');
    await queryRunner.dropColumn('clients', 'pincode');
    await queryRunner.dropColumn('clients', 'country');
    await queryRunner.dropColumn('clients', 'state');
    await queryRunner.dropColumn('clients', 'city');
    await queryRunner.dropColumn('clients', 'address');
    await queryRunner.dropColumn('clients', 'status');
    await queryRunner.dropColumn('clients', 'gstNumber');
    await queryRunner.dropColumn('clients', 'panNumber');
    await queryRunner.dropColumn('clients', 'businessTypeId');
    await queryRunner.dropColumn('clients', 'companyName');
    await queryRunner.dropTable('services', true);
    await queryRunner.dropTable('business_types', true);
  }
}
