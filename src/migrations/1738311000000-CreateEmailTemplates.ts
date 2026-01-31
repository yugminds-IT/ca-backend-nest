import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateEmailTemplates1738311000000 implements MigrationInterface {
  name = 'CreateEmailTemplates1738311000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'email_templates',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'category', type: 'varchar', length: '50' },
          { name: 'type', type: 'varchar', length: '80' },
          { name: 'name', type: 'varchar', length: '255', isNullable: true },
          { name: 'subject', type: 'varchar', length: '500' },
          { name: 'body', type: 'text' },
          { name: 'organizationId', type: 'int', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId'],
            referencedTableName: 'organizations',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('email_templates', true);
  }
}
