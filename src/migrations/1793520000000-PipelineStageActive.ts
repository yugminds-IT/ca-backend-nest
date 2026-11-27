import { MigrationInterface, QueryRunner } from 'typeorm';

/** Lets a stage be turned off without deleting it, so leads already in it keep their place. */
export class PipelineStageActive1793520000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "pipeline_stages" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "pipeline_stages" DROP COLUMN IF EXISTS "isActive"`);
  }
}
