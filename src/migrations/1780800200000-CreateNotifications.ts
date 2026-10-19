import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateNotifications1780800200000 implements MigrationInterface {
  name = 'CreateNotifications1780800200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'type', type: 'varchar', length: '100', default: "'document_upload'" },
          { name: 'organizationId', type: 'int', isNullable: true },
          { name: 'clientId', type: 'int', isNullable: true },
          { name: 'clientName', type: 'varchar', length: '255', isNullable: true },
          { name: 'fileName', type: 'varchar', length: '500', isNullable: true },
          { name: 'fileType', type: 'varchar', length: '100', isNullable: true },
          { name: 'fileSize', type: 'int', isNullable: true },
          { name: 'message', type: 'text', isNullable: true },
          { name: 'isRead', type: 'boolean', default: false },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId'],
            referencedTableName: 'organizations',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['clientId'],
            referencedTableName: 'clients',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [
          { columnNames: ['organizationId'] },
          { columnNames: ['isRead'] },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notifications', true);
  }
}
