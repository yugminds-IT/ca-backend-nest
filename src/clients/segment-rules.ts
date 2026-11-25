// "A group" on the server: the same rules the Send Mails panel builds, turned into SQL over clients.
// Keep in step with matchesRules() in CA-Automations-Frontend/lib/audience.ts: the panel counts locally, the server sends.
import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { SelectQueryBuilder } from 'typeorm';

export const CHOICE_OPS = ['any', 'none', 'empty', 'filled'] as const;
// on: exactly N days from today · ago: exactly N days ago · yearly: same day of the year as today + N (a past date's anniversary)
export const DATE_OPS = ['next', 'last', 'overdue', 'older', 'on', 'ago', 'yearly'] as const;
const FIELD_RE = /^(businessType|service|status|city|state|tags|followUp|onboard|custom:[a-z][a-z0-9_]{0,59})$/;

export class SegmentRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @Matches(FIELD_RE, { message: 'unknown rule field' })
  field: string;

  @IsIn([...CHOICE_OPS, ...DATE_OPS])
  op: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  values?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  days?: number;
}

/** A list of rules, all of which must hold. */
export class SegmentRulesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SegmentRuleDto)
  rules: SegmentRuleDto[];
}

export type SegmentRule = Pick<SegmentRuleDto, 'field' | 'op' | 'values' | 'days'>;

/** The org's local date (YYYY-MM-DD) for a UTC offset in minutes, e.g. 330 for India. */
export function localDay(offsetMinutes: number, now = new Date()): string {
  return new Date(now.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const lowerTrim = (vals: string[] = []) => [...new Set(vals.map((v) => v.trim().toLowerCase()).filter(Boolean))];

/**
 * Narrow a query over clients (alias `c`) to those matching every rule.
 * `today` is the sender's local date, so "follow-up in the next 7 days" means the same thing in the browser and here.
 */
export function applySegmentRules(qb: SelectQueryBuilder<any>, rules: SegmentRule[], organizationId: number, today: string): void {
  if (!DAY_RE.test(today)) throw new BadRequestException('today must be YYYY-MM-DD');
  rules.forEach((r, i) => {
    if (!FIELD_RE.test(r.field)) throw new BadRequestException(`Unknown rule field: ${r.field}`);
    const p = (name: string) => `r${i}_${name}`;

    if (r.field === 'followUp' || r.field === 'onboard') {
      if (!(DATE_OPS as readonly string[]).includes(r.op)) throw new BadRequestException(`Bad date rule: ${r.op}`);
      const col = r.field === 'followUp' ? 'c."followupDate"' : 'c."onboardDate"';
      const t = `CAST(:${p('t')} AS date)`;
      const n = `:${p('n')}::int`;
      const sql = {
        next: `${col} BETWEEN ${t} AND ${t} + ${n}`,
        last: `${col} BETWEEN ${t} - ${n} AND ${t}`,
        overdue: `${col} < ${t}`,
        older: `${col} < ${t} - ${n}`,
        on: `${col} = ${t} + ${n}`,
        ago: `${col} = ${t} - ${n}`,
        yearly: `to_char(${col}, 'MM-DD') = to_char(${t} + ${n}, 'MM-DD') AND ${col} <= ${t}`,
      }[r.op as (typeof DATE_OPS)[number]];
      qb.andWhere(sql, { [p('t')]: today, [p('n')]: Math.max(0, r.days ?? 0) });
      return;
    }

    if (!(CHOICE_OPS as readonly string[]).includes(r.op)) throw new BadRequestException(`Bad rule: ${r.op}`);
    const vals = lowerTrim(r.values);
    // "any of" / "none of" with nothing picked yet doesn't narrow anything (same as the panel)
    if ((r.op === 'any' || r.op === 'none') && vals.length === 0) return;

    // hit: the contact has one of the chosen values · has: the contact has any value at all
    let hit: string;
    let has: string;
    const params: Record<string, unknown> = { [p('v')]: vals };
    if (r.field === 'status' || r.field === 'city' || r.field === 'state') {
      const col = `c."${r.field}"`;
      hit = `LOWER(TRIM(${col})) IN (:...${p('v')})`;
      has = `NULLIF(TRIM(${col}), '') IS NOT NULL`;
      // a NULL column is "none of" anything, so check presence explicitly
      if (r.op === 'none') hit = `(${has} AND ${hit})`;
    } else if (r.field === 'businessType') {
      hit = `EXISTS (SELECT 1 FROM business_types bt WHERE bt.id = c."businessTypeId" AND LOWER(TRIM(bt.name)) IN (:...${p('v')}))`;
      has = `EXISTS (SELECT 1 FROM business_types bt WHERE bt.id = c."businessTypeId" AND TRIM(bt.name) <> '')`;
    } else if (r.field === 'service') {
      hit = `EXISTS (SELECT 1 FROM client_services cs JOIN services s ON s.id = cs."serviceId" WHERE cs."clientId" = c.id AND LOWER(TRIM(s.name)) IN (:...${p('v')}))`;
      has = `EXISTS (SELECT 1 FROM client_services cs JOIN services s ON s.id = cs."serviceId" WHERE cs."clientId" = c.id AND TRIM(s.name) <> '')`;
    } else if (r.field === 'tags') {
      hit = `EXISTS (SELECT 1 FROM unnest(c.tags) AS tg(name) WHERE LOWER(TRIM(tg.name)) IN (:...${p('v')}))`;
      has = `cardinality(c.tags) > 0`;
    } else {
      // custom:<key> — the contact's own value only; a field's default doesn't count as filled in
      params[p('k')] = r.field.slice('custom:'.length);
      params[p('o')] = organizationId;
      const own = `SELECT 1 FROM client_custom_values cv JOIN custom_variables v ON v.id = cv."variableId"
        WHERE cv."clientId" = c.id AND v."organizationId" = :${p('o')} AND v.key = :${p('k')}`;
      hit = `EXISTS (${own} AND LOWER(TRIM(cv.value)) IN (:...${p('v')}))`;
      has = `EXISTS (${own} AND TRIM(cv.value) <> '')`;
    }
    const sql = { any: hit, none: `NOT ${hit}`, filled: has, empty: `NOT ${has}` }[r.op as (typeof CHOICE_OPS)[number]];
    // empty value lists are never sent to SQL (IN () is invalid)
    qb.andWhere(sql, vals.length ? params : { ...params, [p('v')]: [''] });
  });
}
