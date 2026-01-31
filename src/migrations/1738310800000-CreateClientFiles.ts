import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateClientFiles1738310800000 implements MigrationInterface {
  name = 'CreateClientFiles1738310800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'client_files',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'clientId', type: 'uuid' },
          { name: 'fileName', type: 'varchar', length: '255' },
          { name: 'type', type: 'varchar', length: '100', isNullable: true },
          { name: 'format', type: 'varchar', length: '20' },
          { name: 'mimeType', type: 'varchar', length: '100', isNullable: true },
          { name: 'fileSize', type: 'int', isNullable: true },
          { name: 's3Key', type: 'varchar', length: '500' },
          { name: 's3Bucket', type: 'varchar', length: '255' },
          { name: 'uploadedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'client_files',
      new TableForeignKey({
        columnNames: ['clientId'],
        referencedTableName: 'clients',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const fk = (await queryRunner.getTable('client_files'))?.foreignKeys.find(
      (k) => k.columnNames.indexOf('clientId') !== -1,
    );
    if (fk) await queryRunner.dropForeignKey('client_files', fk);
    await queryRunner.dropTable('client_files', true);
  }
}
