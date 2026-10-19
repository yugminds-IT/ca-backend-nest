import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateTdsFilingSessions1780800000000 implements MigrationInterface {
  name = 'CreateTdsFilingSessions1780800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.createTable(
      new Table({
        name: 'tds_filing_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'clientId',       type: 'int' },
          { name: 'organizationId', type: 'int', isNullable: true },
          { name: 'status',         type: 'varchar', length: '50', default: "'DRAFT'" },
          { name: 'formType',       type: 'varchar', length: '10', isNullable: true },
          { name: 'formVersion',    type: 'varchar', length: '5',  isNullable: true },
          { name: 'quarter',        type: 'varchar', length: '5',  isNullable: true },
          { name: 'assessmentYear', type: 'varchar', length: '20', isNullable: true },
          { name: 'financialYear',  type: 'varchar', length: '20', isNullable: true },
          { name: 'challanData',    type: 'jsonb', isNullable: true },
          { name: 'deducteesData',  type: 'jsonb', isNullable: true },
          { name: 'comparisonData', type: 'jsonb', isNullable: true },
          { name: 'selectedSections', type: 'text', isArray: true, isNullable: true },
          { name: 'generatedFiles', type: 'jsonb', isNullable: true },
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
    await queryRunner.dropTable('tds_filing_sessions', true);
  }
}
