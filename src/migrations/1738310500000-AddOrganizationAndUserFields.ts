import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOrganizationAndUserFields1738310500000
  implements MigrationInterface
{
  name = 'AddOrganizationAndUserFields1738310500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('organizations', [
      new TableColumn({ name: 'city', type: 'varchar', length: '100', isNullable: true }),
      new TableColumn({ name: 'state', type: 'varchar', length: '100', isNullable: true }),
      new TableColumn({ name: 'country', type: 'varchar', length: '100', isNullable: true }),
      new TableColumn({ name: 'pincode', type: 'varchar', length: '20', isNullable: true }),
    ]);
    await queryRunner.addColumns('users', [
      new TableColumn({ name: 'name', type: 'varchar', length: '255', isNullable: true }),
      new TableColumn({ name: 'phone', type: 'varchar', length: '50', isNullable: true }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('organizations', 'pincode');
    await queryRunner.dropColumn('organizations', 'country');
    await queryRunner.dropColumn('organizations', 'state');
    await queryRunner.dropColumn('organizations', 'city');
    await queryRunner.dropColumn('users', 'phone');
    await queryRunner.dropColumn('users', 'name');
  }
}
