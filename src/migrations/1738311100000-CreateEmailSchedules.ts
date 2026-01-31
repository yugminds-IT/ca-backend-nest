import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateEmailSchedules1738311100000 implements MigrationInterface {
  name = 'CreateEmailSchedules1738311100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'email_schedules',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'templateId', type: 'int' },
          { name: 'recipientEmails', type: 'jsonb' },
          { name: 'variables', type: 'jsonb', isNullable: true },
          { name: 'scheduledAt', type: 'timestamp' },
          { name: 'status', type: 'varchar', length: '20', default: "'pending'" },
          { name: 'organizationId', type: 'int', isNullable: true },
          { name: 'createdBy', type: 'int' },
          { name: 'sentAt', type: 'timestamp', isNullable: true },
          { name: 'errorMessage', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          { columnNames: ['templateId'], referencedTableName: 'email_templates', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['organizationId'], referencedTableName: 'organizations', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
          { columnNames: ['createdBy'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('email_schedules', true);
  }
}
