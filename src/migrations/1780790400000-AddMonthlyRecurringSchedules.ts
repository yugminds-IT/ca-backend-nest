import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class AddMonthlyRecurringSchedules1780790400000 implements MigrationInterface {
  name = 'AddMonthlyRecurringSchedules1780790400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'email_recurring_schedules',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'templateId', type: 'int', isNullable: true },
          { name: 'subject', type: 'varchar', length: '500', isNullable: true },
          { name: 'body', type: 'text', isNullable: true },
          { name: 'recipientEmails', type: 'jsonb' },
          { name: 'variables', type: 'jsonb', isNullable: true },
          { name: 'months', type: 'jsonb' },
          { name: 'days', type: 'jsonb' },
          { name: 'times', type: 'jsonb' },
          { name: 'timeZoneOffset', type: 'varchar', length: '10', isNullable: true },
          { name: 'status', type: 'varchar', length: '20', default: "'active'" },
          { name: 'organizationId', type: 'int', isNullable: true },
          { name: 'createdBy', type: 'int' },
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

    await queryRunner.addColumn(
      'email_schedules',
      new TableColumn({
        name: 'recurringScheduleId',
        type: 'int',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'email_schedules',
      new TableForeignKey({
        columnNames: ['recurringScheduleId'],
        referencedTableName: 'email_recurring_schedules',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('email_schedules');
    const fk = table?.foreignKeys.find((f) => f.columnNames.includes('recurringScheduleId'));
    if (fk) await queryRunner.dropForeignKey('email_schedules', fk);
    await queryRunner.dropColumn('email_schedules', 'recurringScheduleId');
    await queryRunner.dropTable('email_recurring_schedules', true);
  }
}
