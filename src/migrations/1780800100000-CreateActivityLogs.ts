import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateActivityLogs1780800100000 implements MigrationInterface {
  name = 'CreateActivityLogs1780800100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'activity_logs',
        columns: [
          { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'type', type: 'varchar', length: '50' },
          { name: 'userId', type: 'int', isNullable: true },
          { name: 'userEmail', type: 'varchar', length: '255', isNullable: true },
          { name: 'userRole', type: 'varchar', length: '100', isNullable: true },
          { name: 'organizationId', type: 'int', isNullable: true },
          { name: 'orgName', type: 'varchar', length: '255', isNullable: true },
          { name: 'method', type: 'varchar', length: '10', isNullable: true },
          { name: 'path', type: 'varchar', length: '500', isNullable: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'ipAddress', type: 'varchar', length: '100', isNullable: true },
          { name: 'userAgent', type: 'varchar', length: '500', isNullable: true },
          { name: 'statusCode', type: 'int', isNullable: true },
          { name: 'durationMs', type: 'int', isNullable: true },
          { name: 'isError', type: 'boolean', default: false },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true, // ifNotExists = true
    );

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_logs_type" ON "activity_logs" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_logs_createdAt" ON "activity_logs" ("createdAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('activity_logs', true);
  }
}
