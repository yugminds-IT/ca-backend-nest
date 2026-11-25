import { readdirSync } from 'fs';
import { join } from 'path';
import { getMetadataArgsStorage } from 'typeorm';

// Plain `timestamp` drops the zone: now() stores the DB session's wall time and Node reads it as UTC
// (that shifted every createdAt by 5.5 h on an IST database). Every time column must be timestamptz.
const PLAIN = new Set(['timestamp', 'timestamp without time zone', 'datetime', Date]);
const DATE_MODES = new Set(['createDate', 'updateDate', 'deleteDate']);

function requireEntities(dir: string) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) requireEntities(p);
    else if (e.name.endsWith('.entity.ts')) require(p);
  }
}

describe('entity time columns', () => {
  it('are all timestamptz', () => {
    requireEntities(join(__dirname, '..'));
    const cols = getMetadataArgsStorage().columns;
    expect(cols.length).toBeGreaterThan(50); // entities actually loaded
    const bad = cols
      .filter((c) => PLAIN.has(c.options.type as any) || (DATE_MODES.has(c.mode) && c.options.type !== 'timestamptz'))
      .map((c) => `${(c.target as Function).name}.${c.propertyName}`);
    expect(bad).toEqual([]);
  });
});
