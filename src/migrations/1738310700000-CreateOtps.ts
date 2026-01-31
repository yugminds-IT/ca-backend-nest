import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateOtps1738310700000 implements MigrationInterface {
  name = 'CreateOtps1738310700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'otps',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'email', type: 'varchar', length: '255' },
          { name: 'otp', type: 'varchar', length: '10' },
          { name: 'type', type: 'varchar', length: '50', default: "'password_reset'" },
          { name: 'expiresAt', type: 'timestamp' },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.query(`CREATE INDEX "IDX_otps_email_type" ON "otps" ("email", "type")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('otps', true);
  }
}
