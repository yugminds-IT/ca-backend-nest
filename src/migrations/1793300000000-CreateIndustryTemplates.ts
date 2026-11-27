import { MigrationInterface, QueryRunner } from 'typeorm';
import { INDUSTRY_PRESETS } from '../common/industry-presets';
import { INDUSTRY_PIPELINE_STAGES } from '../common/industry-pipelines';

/**
 * Industry templates move into the database (Phase 9). Seeds one row per code-defined preset.
 * ON CONFLICT DO NOTHING keeps any edits an admin made after the first run. Idempotent.
 */
export class CreateIndustryTemplates1793300000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "industry_templates" (
        "key" varchar(40) PRIMARY KEY,
        "name" varchar(160) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "icon" varchar(60) NOT NULL DEFAULT 'Building2',
        "variables" jsonb NOT NULL DEFAULT '[]',
        "starterTemplates" jsonb NOT NULL DEFAULT '[]',
        "pipelineStages" jsonb NOT NULL DEFAULT '[]',
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
    for (const preset of Object.values(INDUSTRY_PRESETS)) {
      await q.query(
        `INSERT INTO "industry_templates" ("key", "name", "description", "icon", "variables", "starterTemplates", "pipelineStages")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
         ON CONFLICT ("key") DO NOTHING`,
        [
          preset.key,
          preset.name,
          preset.description,
          preset.icon,
          JSON.stringify(preset.variables ?? []),
          JSON.stringify(preset.starterTemplates ?? []),
          JSON.stringify(INDUSTRY_PIPELINE_STAGES[preset.key] ?? INDUSTRY_PIPELINE_STAGES.custom),
        ],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "industry_templates"`);
  }
}
