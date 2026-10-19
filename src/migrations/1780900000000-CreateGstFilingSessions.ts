import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateGstFilingSessions1780900000000 implements MigrationInterface {
  name = 'CreateGstFilingSessions1780900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.createTable(
      new Table({
        name: 'gst_filing_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'clientId',       type: 'int' },
          { name: 'organizationId', type: 'int',     isNullable: true },
          { name: 'status',         type: 'varchar', length: '50',  default: "'DRAFT'" },
          { name: 'documentName',   type: 'varchar', length: '255', isNullable: true },
          { name: 'documentType',   type: 'varchar', length: '100', isNullable: true },
          { name: 'financialYear',  type: 'varchar', length: '20',  isNullable: true },
          { name: 'period',         type: 'varchar', length: '50',  isNullable: true },
          { name: 'extractedData',  type: 'jsonb', isNullable: true },
          { name: 'comparisonData', type: 'jsonb', isNullable: true },
          { name: 'celeryTaskId',   type: 'varchar', length: '100', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          {
            columnNames: ['clientId'],
            referencedTableName: 'clients',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [
          { columnNames: ['organizationId'] },
          { columnNames: ['clientId'] },
          { columnNames: ['status'] },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('gst_filing_sessions', true);
  }
}
