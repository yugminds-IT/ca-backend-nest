import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every plain `timestamp` column becomes `timestamptz`, so a value can no longer be read in the wrong zone.
 *
 * Existing values are read as UTC: production's database runs in UTC (SHOW timezone, checked 2026-11-24)
 * and its app has forced TZ=UTC since March 2026, so both the DB-filled and the app-written columns hold UTC.
 * (The dev database ca_db_local ran an earlier version of this file that also undid its IST-written values;
 * it is already applied there, so this version only runs on databases that are UTC.)
 * ponytail: assumes the database being migrated wrote UTC; check SHOW timezone on any other environment first.
 */
const CU = ['createdAt', 'updatedAt'];
const DB_FILLED: Record<string, string[]> = {
  activity_logs: ['createdAt'],
  api_keys: CU,
  business_types: CU,
  client_custom_values: ['updatedAt'],
  client_directors: CU,
  client_files: ['uploadedAt'],
  clients: CU,
  contact_lists: CU,
  contacts: CU,
  custom_variables: CU,
  email_logs: CU,
  email_recurring_schedules: CU,
  email_schedules: CU,
  email_templates: CU,
  form_submissions: CU,
  gst_filing_sessions: CU,
  notifications: ['createdAt'],
  organizations: CU,
  otps: ['createdAt'],
  pricing_plans: CU,
  roles: CU,
  segments: CU,
  services: CU,
  suppression_list: ['createdAt'],
  tds_filing_sessions: CU,
  users: CU,
  webhook_endpoints: CU,
  workspace_features: CU,
};
const APP_WRITTEN: Record<string, string[]> = {
  api_keys: ['lastUsedAt'],
  email_logs: ['openedAt', 'clickedAt', 'deliveredAt'],
  email_schedules: ['scheduledAt', 'sentAt'],
  otps: ['expiresAt'],
};

const tables = [...new Set([...Object.keys(DB_FILLED), ...Object.keys(APP_WRITTEN)])];

export class AllTimestampsTimestamptz1792425000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of tables) {
      const alters = [
        ...(DB_FILLED[t] ?? []).map((c) => `ALTER COLUMN "${c}" TYPE timestamptz USING "${c}" AT TIME ZONE 'UTC'`),
        ...(APP_WRITTEN[t] ?? []).map((c) => `ALTER COLUMN "${c}" TYPE timestamptz USING "${c}" AT TIME ZONE 'UTC'`),
      ];
      await queryRunner.query(`ALTER TABLE "${t}" ${alters.join(',\n')}`);
    }
    const left: { t: string; c: string }[] = await queryRunner.query(`
      SELECT c.table_name t, c.column_name c FROM information_schema.columns c
      JOIN information_schema.tables x USING (table_schema, table_name)
      WHERE c.table_schema = 'public' AND x.table_type = 'BASE TABLE' AND c.data_type = 'timestamp without time zone'`);
    if (left.length) throw new Error(`Still plain timestamp: ${left.map((r) => `${r.t}.${r.c}`).join(', ')}`);
  }

  // Back to plain timestamp holding UTC wall time (what the app reads with the UTC session).
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of tables) {
      const cols = [...(DB_FILLED[t] ?? []), ...(APP_WRITTEN[t] ?? [])];
      await queryRunner.query(
        `ALTER TABLE "${t}" ${cols.map((c) => `ALTER COLUMN "${c}" TYPE timestamp USING "${c}" AT TIME ZONE 'UTC'`).join(', ')}`,
      );
    }
  }
}
