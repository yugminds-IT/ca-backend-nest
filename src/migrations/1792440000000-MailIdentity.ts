import { MigrationInterface, QueryRunner } from 'typeorm';

// Where client replies go, and the sign-off added to every email the firm sends to clients.
export class MailIdentity1792440000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN IF NOT EXISTS "mailReplyTo" varchar(320),
        ADD COLUMN IF NOT EXISTS "mailSignature" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "mailReplyTo", DROP COLUMN "mailSignature"`);
  }
}
