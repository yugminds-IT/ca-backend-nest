import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Client portal passwords used to be kept in a decryptable form so staff could look them up.
 * They are now only shown once when generated, so the stored copies are wiped. Logins keep working:
 * only the bcrypt hash is used to sign in.
 */
export class ClearStoredPlainPasswords1793550000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "users" SET "encrypted_plain_password" = NULL WHERE "encrypted_plain_password" IS NOT NULL`);
  }

  public async down(): Promise<void> {
    // The wiped values cannot be brought back.
  }
}
