import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddEncryptedPlainPasswordToUsers1738311200000
  implements MigrationInterface
{
  name = 'AddEncryptedPlainPasswordToUsers1738311200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'encrypted_plain_password',
        type: 'varchar',
        length: '512',
        isNullable: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'encrypted_plain_password');
  }
}
