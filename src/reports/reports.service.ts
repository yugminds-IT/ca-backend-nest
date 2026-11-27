import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Lead, PipelineStage } from '../entities/crm.entities';
import { Dashboard, ReportSchedule } from '../entities/reports.entities';
import { EmailLog } from '../entities/email-log.entity';
import { FormSubmission } from '../entities/form-submission.entity';
import { BusinessUnit } from '../entities/business-unit.entity';
import { User } from '../entities/user.entity';
import { AccessService } from '../access/access.service';
import { applyLeadScope } from '../access/lead-scope';
import { AccessContext } from '../access/permissions';
import { requireOrgScope } from '../leads/lead-scope.util';
import { EmailService } from '../email/email.service';
import {
  Metric,
  GroupBy,
  ReportFilters,
  ScheduleSpec,
  WidgetSpec,
  addDays,
  istToday,
  nextRunAfter,
  rangeBounds,
  resolveRange,
  toCsv,
  validateFilters,
  validateSchedule,
  validateWidget,
} from './reports.rules';

/** Groupings the standard reports use on top of the widget groupings. */
type GroupKey = GroupBy | 'form';

/** Each metric as one SQL aggregate over the lead alias `l`. */
const METRIC_SQL: Record<Metric, string> = {
  lead_count: 'COUNT(l.id)',
  won_count: "COUNT(l.id) FILTER (WHERE l.status = 'won')",
  pipeline_value: "COALESCE(SUM(l.value) FILTER (WHERE l.status = 'open'), 0)",
  won_value: "COALESCE(SUM(l.value) FILTER (WHERE l.status = 'won'), 0)",
};

const DAY_SQL = "to_char(l.createdAt + interval '5 hours 30 minutes', 'YYYY-MM-DD')";

const METRIC_LABEL_TEXT: Record<Metric, string> = {
  lead_count: 'Leads',
  won_count: 'Won leads',
  pipeline_value: 'Open pipeline value',
  won_value: 'Won value',
};

export interface Section {
  name: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
}

export interface GroupedRow {
  key: string | number | null;
  label: string;
  values: Partial<Record<Metric, number>>;
}

export interface WidgetResult {
  widget: WidgetSpec;
  rows: Array<{ key: string | number | null; label: string; value: number }>;
  total: number;
}

const toNumber = (v: unknown): number => (v == null ? 0 : Number(v));

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(EmailLog) private readonly emailLogs: Repository<EmailLog>,
    @InjectRepository(Dashboard) private readonly dashboards: Repository<Dashboard>,
    @InjectRepository(ReportSchedule) private readonly schedules: Repository<ReportSchedule>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: AccessService,
    private readonly email: EmailService,
  ) {}

  // ---------------------------------------------------------------- queries

  /** Every lead query starts here: the organization, the viewer's data scope, the date window and the filters. */
  private leadQuery(orgId: number, ctx: AccessContext, f: ReportFilters): SelectQueryBuilder<Lead> {
    const { from, to } = resolveRange(f);
    const { start, end } = rangeBounds(from, to);
    const qb = this.leads
      .createQueryBuilder('l')
      .where('l.organizationId = :orgId', { orgId })
      .andWhere('l.createdAt >= :start', { start: start.toISOString() })
      .andWhere('l.createdAt < :end', { end: end.toISOString() });
    applyLeadScope(qb, ctx, 'l');
    if (f.businessUnitId) qb.andWhere('l.businessUnitId = :unitId', { unitId: f.businessUnitId });
    if (f.ownerUserId) qb.andWhere('l.ownerUserId = :ownerId', { ownerId: f.ownerUserId });
    if (f.source) qb.andWhere('l.source = :source', { source: f.source });
    return qb;
  }

  /** Totals for the window: leads, won, lost, and the value of open and won leads. */
  private async totals(orgId: number, ctx: AccessContext, f: ReportFilters) {
    const row = await this.leadQuery(orgId, ctx, f)
      .select('COUNT(l.id)', 'leads')
      .addSelect("COUNT(l.id) FILTER (WHERE l.status = 'won')", 'won')
      .addSelect("COUNT(l.id) FILTER (WHERE l.status = 'lost')", 'lost')
      .addSelect("COALESCE(SUM(l.value) FILTER (WHERE l.status = 'open'), 0)", 'pipelineValue')
      .addSelect("COALESCE(SUM(l.value) FILTER (WHERE l.status = 'won'), 0)", 'wonValue')
      .getRawOne<Record<string, string>>();
    const leads = toNumber(row?.leads);
    const won = toNumber(row?.won);
    const lost = toNumber(row?.lost);
    return {
      leads,
      won,
      lost,
      open: leads - won - lost,
      pipelineValue: toNumber(row?.pipelineValue),
      wonValue: toNumber(row?.wonValue),
      /** Won as a share of closed leads (won plus lost). Null while nothing has closed. */
      winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : null,
    };
  }

  /** The grouping's label and key, the join it needs, and its ordering. */
  private groupSql(
    key: GroupKey,
    qb: SelectQueryBuilder<Lead>,
  ): { key: string; label: string; group: string[]; order: string; orderDir: 'ASC' | 'DESC' } {
    switch (key) {
      case 'source':
        return {
          key: "COALESCE(l.source, 'Unknown')",
          label: "COALESCE(l.source, 'Unknown')",
          group: ["COALESCE(l.source, 'Unknown')"],
          order: "COUNT(l.id)",
          orderDir: 'DESC',
        };
      case 'stage':
        qb.leftJoin(PipelineStage, 's', 's.id = l.stageId');
        return { key: 's.id', label: 's.name', group: ['s.id', 's.name', 's.position'], order: 's.position', orderDir: 'ASC' };
      case 'owner':
        qb.leftJoin(User, 'u', 'u.id = l.ownerUserId');
        return {
          key: 'l.ownerUserId',
          label: "COALESCE(u.name, 'Unassigned')",
          group: ['l.ownerUserId', "COALESCE(u.name, 'Unassigned')"],
          order: 'COUNT(l.id)',
          orderDir: 'DESC',
        };
      case 'unit':
        qb.innerJoin(BusinessUnit, 'b', 'b.id = l.businessUnitId');
        return { key: 'b.id', label: 'b.name', group: ['b.id', 'b.name'], order: 'COUNT(l.id)', orderDir: 'DESC' };
      case 'day':
        return { key: DAY_SQL, label: DAY_SQL, group: [DAY_SQL], order: DAY_SQL, orderDir: 'ASC' };
      case 'lost_reason':
        qb.andWhere("l.status = 'lost'");
        return {
          key: "COALESCE(l.lostReason, 'No reason given')",
          label: "COALESCE(l.lostReason, 'No reason given')",
          group: ["COALESCE(l.lostReason, 'No reason given')"],
          order: 'COUNT(l.id)',
          orderDir: 'DESC',
        };
      case 'form':
        qb.innerJoin(FormSubmission, 'f', 'f.id = l.formSubmissionId');
        return {
          key: 'f.id',
          label: "COALESCE(f.formName, 'Unnamed form')",
          group: ['f.id', "COALESCE(f.formName, 'Unnamed form')"],
          order: 'COUNT(l.id)',
          orderDir: 'DESC',
        };
      default:
        throw new BadRequestException('Unknown grouping');
    }
  }

  /** Leads grouped by one dimension, with each requested metric. */
  private async grouped(
    orgId: number,
    ctx: AccessContext,
    f: ReportFilters,
    key: GroupKey,
    metrics: Metric[],
  ): Promise<GroupedRow[]> {
    const qb = this.leadQuery(orgId, ctx, f);
    const g = this.groupSql(key, qb);
    qb.select(g.key, 'key').addSelect(g.label, 'label');
    for (const m of metrics) qb.addSelect(METRIC_SQL[m], m);
    g.group.forEach((expr, i) => (i === 0 ? qb.groupBy(expr) : qb.addGroupBy(expr)));
    qb.orderBy(g.order, g.orderDir);
    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((r) => {
      const values: Partial<Record<Metric, number>> = {};
      for (const m of metrics) values[m] = toNumber(r[m]);
      return {
        key: (r.key as string | number | null) ?? null,
        label: String(r.label ?? ''),
        values,
      };
    });
  }

  /** Stage timing for leads that a staff member has answered. */
  private async responseTimes(orgId: number, ctx: AccessContext, f: ReportFilters) {
    const row = await this.leadQuery(orgId, ctx, f)
      .select('COUNT(l.id) FILTER (WHERE l.firstRespondedAt IS NOT NULL)', 'responded')
      .addSelect(
        'AVG(EXTRACT(EPOCH FROM (l.firstRespondedAt - l.createdAt)) / 60) FILTER (WHERE l.firstRespondedAt IS NOT NULL)',
        'avgMinutes',
      )
      .addSelect(
        'percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l.firstRespondedAt - l.createdAt)) / 60) FILTER (WHERE l.firstRespondedAt IS NOT NULL)',
        'medianMinutes',
      )
      .addSelect('COUNT(l.id) FILTER (WHERE l.firstResponseDueAt IS NOT NULL AND l.firstRespondedAt IS NOT NULL)', 'withSla')
      .addSelect(
        'COUNT(l.id) FILTER (WHERE l.firstResponseDueAt IS NOT NULL AND l.firstRespondedAt IS NOT NULL AND l.firstRespondedAt <= l.firstResponseDueAt)',
        'metSla',
      )
      .getRawOne<Record<string, string | null>>();
    const withSla = toNumber(row?.withSla);
    return {
      responded: toNumber(row?.responded),
      avgMinutes: row?.avgMinutes == null ? null : Math.round(Number(row.avgMinutes)),
      medianMinutes: row?.medianMinutes == null ? null : Math.round(Number(row.medianMinutes)),
      slaMetPercent: withSla > 0 ? Math.round((toNumber(row?.metSla) / withSla) * 1000) / 10 : null,
    };
  }

  /** CRM emails (sent from a lead) that belong to leads the viewer can see. */
  private async emailPerformance(orgId: number, ctx: AccessContext, f: ReportFilters) {
    const { from, to } = resolveRange(f);
    const { start, end } = rangeBounds(from, to);
    const qb = this.emailLogs
      .createQueryBuilder('e')
      .innerJoin(Lead, 'l', "l.id = CAST(e.metadata ->> 'crmLeadId' AS integer)")
      .where('e.organizationId = :orgId', { orgId })
      .andWhere("e.metadata ->> 'crmLeadId' IS NOT NULL")
      .andWhere('e.createdAt >= :start', { start: start.toISOString() })
      .andWhere('e.createdAt < :end', { end: end.toISOString() });
    applyLeadScope(qb, ctx, 'l');
    if (f.businessUnitId) qb.andWhere('l.businessUnitId = :unitId', { unitId: f.businessUnitId });
    if (f.ownerUserId) qb.andWhere('l.ownerUserId = :ownerId', { ownerId: f.ownerUserId });
    const row = await qb
      .select('COUNT(e.id)', 'sent')
      .addSelect('COUNT(e.id) FILTER (WHERE e.openCount > 0)', 'opened')
      .addSelect('COUNT(e.id) FILTER (WHERE e.clickCount > 0)', 'clicked')
      .getRawOne<Record<string, string>>();
    const sent = toNumber(row?.sent);
    return {
      sent,
      opened: toNumber(row?.opened),
      clicked: toNumber(row?.clicked),
      openRate: sent > 0 ? Math.round((toNumber(row?.opened) / sent) * 1000) / 10 : null,
      clickRate: sent > 0 ? Math.round((toNumber(row?.clicked) / sent) * 1000) / 10 : null,
    };
  }

  /** One widget's figures for the viewer. */
  async runWidget(user: User, spec: WidgetSpec, filters: ReportFilters): Promise<WidgetResult> {
    this.assertValid(validateWidget(spec), 'widget');
    this.assertValid(validateFilters(filters), 'filters');
    const orgId = requireOrgScope(user, user.organizationId);
    const ctx = await this.access.contextFor(user);
    if (spec.groupBy === 'none') {
      const qb = this.leadQuery(orgId, ctx, filters).select(METRIC_SQL[spec.metric], 'value');
      const row = await qb.getRawOne<{ value: string }>();
      const value = toNumber(row?.value);
      return { widget: spec, rows: [{ key: null, label: 'Total', value }], total: value };
    }
    const grouped = await this.grouped(orgId, ctx, filters, spec.groupBy, [spec.metric]);
    const rows = grouped.map((g) => ({ key: g.key, label: g.label, value: g.values[spec.metric] ?? 0 }));
    return { widget: spec, rows, total: rows.reduce((sum, r) => sum + r.value, 0) };
  }

  // ---------------------------------------------------------------- standard reports

  /** The standard pack: totals, sources, units, stages, response times, owners, lost reasons, forms and email. */
  async standard(user: User, filters: ReportFilters) {
    this.assertValid(validateFilters(filters), 'filters');
    const orgId = requireOrgScope(user, user.organizationId);
    const ctx = await this.access.contextFor(user);
    const range = resolveRange(filters);
    const [totals, bySource, byUnit, byStage, responseTime, owners, lostReasons, forms, email] = await Promise.all([
      this.totals(orgId, ctx, filters),
      this.grouped(orgId, ctx, filters, 'source', ['lead_count', 'won_count', 'won_value']),
      this.grouped(orgId, ctx, filters, 'unit', ['lead_count', 'won_count', 'won_value']),
      this.grouped(orgId, ctx, filters, 'stage', ['lead_count']),
      this.responseTimes(orgId, ctx, filters),
      this.grouped(orgId, ctx, filters, 'owner', ['lead_count', 'won_count', 'won_value']),
      this.grouped(orgId, ctx, filters, 'lost_reason', ['lead_count']),
      this.grouped(orgId, ctx, filters, 'form', ['lead_count', 'won_count', 'won_value']),
      this.emailPerformance(orgId, ctx, filters),
    ]);
    return {
      range,
      totals,
      bySource,
      byUnit,
      byStage,
      responseTime,
      owners,
      lostReasons,
      forms,
      email,
    };
  }

  // ---------------------------------------------------------------- exports and schedules

  /** Sheets for the standard pack or a dashboard, used by Excel and CSV exports and scheduled emails. */
  private async standardSections(user: User, filters: ReportFilters): Promise<{ title: string; sections: Section[] }> {
    const r = await this.standard(user, filters);
    const sections: Section[] = [
      {
        name: 'Summary',
        headers: ['Measure', 'Value'],
        rows: [
          ['Leads', r.totals.leads],
          ['Won', r.totals.won],
          ['Lost', r.totals.lost],
          ['Open', r.totals.open],
          ['Win rate (%)', r.totals.winRate],
          ['Open pipeline value', r.totals.pipelineValue],
          ['Won value', r.totals.wonValue],
          ['Median first response (min)', r.responseTime.medianMinutes],
          ['First response within SLA (%)', r.responseTime.slaMetPercent],
        ],
      },
      this.groupedSection('By source', 'Source', r.bySource),
      this.groupedSection('By business unit', 'Business unit', r.byUnit),
      this.groupedSection('By stage (where leads sit now)', 'Stage', r.byStage, ['lead_count']),
      this.groupedSection('Owners', 'Owner', r.owners),
      this.groupedSection('Lost reasons', 'Reason', r.lostReasons, ['lead_count']),
      this.groupedSection('Forms', 'Form', r.forms),
      {
        name: 'Email',
        headers: ['Measure', 'Value'],
        rows: [
          ['Emails sent from leads', r.email.sent],
          ['Opened', r.email.opened],
          ['Open rate (%)', r.email.openRate],
          ['Clicked', r.email.clicked],
          ['Click rate (%)', r.email.clickRate],
        ],
      },
    ];
    return { title: `Standard reports ${r.range.from} to ${r.range.to}`, sections };
  }

  private groupedSection(name: string, label: string, rows: GroupedRow[], metrics: Metric[] = ['lead_count', 'won_count', 'won_value']): Section {
    return {
      name,
      headers: [label, ...metrics.map((m) => METRIC_LABEL_TEXT[m])],
      rows: rows.map((g) => [g.label, ...metrics.map((m) => g.values[m] ?? 0)]),
    };
  }

  private async dashboardSections(user: User, dashboard: Dashboard, filters: ReportFilters) {
    const sections: Section[] = [];
    for (const widget of dashboard.widgets) {
      const result = await this.runWidget(user, widget, filters);
      sections.push({
        name: widget.title,
        headers: ['Group', METRIC_LABEL_TEXT[widget.metric]],
        rows: result.rows.map((r) => [r.label, r.value]),
      });
    }
    return { title: dashboard.name, sections };
  }

  /** Excel workbook with one sheet per section. */
  async toWorkbook(sections: Section[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    const used = new Set<string>();
    for (const section of sections) {
      let name = section.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet';
      for (let i = 2; used.has(name); i++) name = `${section.name.slice(0, 27)} ${i}`;
      used.add(name);
      const sheet = wb.addWorksheet(name);
      sheet.addRow(section.headers).font = { bold: true };
      for (const row of section.rows) sheet.addRow(row);
      sheet.columns.forEach((c) => (c.width = 24));
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** One CSV file: each section under a title line, sections separated by a blank line. */
  toCsvFile(sections: Section[]): Buffer {
    const parts = sections.map((s) => `# ${s.name}\r\n${toCsv(s.headers, s.rows)}`);
    return Buffer.from(parts.join('\r\n\r\n'), 'utf8');
  }

  /** The file for a standard pack or a dashboard, in the requested format. */
  async exportFile(
    user: User,
    source: { kind: 'standard' } | { kind: 'dashboard'; id: number },
    filters: ReportFilters,
    format: 'xlsx' | 'csv',
  ) {
    let built: { title: string; sections: Section[] };
    if (source.kind === 'standard') {
      built = await this.standardSections(user, filters);
    } else {
      const dashboard = await this.getDashboardRecord(user, source.id);
      built = await this.dashboardSections(user, dashboard, filters);
    }
    const stamp = istToday();
    const base = built.title.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
    if (format === 'csv') {
      return {
        filename: `${base}-${stamp}.csv`,
        contentType: 'text/csv; charset=utf-8',
        buffer: this.toCsvFile(built.sections),
      };
    }
    return {
      filename: `${base}-${stamp}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await this.toWorkbook(built.sections),
    };
  }

  // ---------------------------------------------------------------- dashboards

  /** A dashboard in the caller's organization. Other organizations' dashboards look like "not found". */
  private async getDashboardRecord(user: User, id: number): Promise<Dashboard> {
    const orgId = requireOrgScope(user, user.organizationId);
    const dashboard = await this.dashboards.findOne({ where: { id } });
    if (!dashboard || dashboard.organizationId !== orgId) throw new NotFoundException('Dashboard not found');
    return dashboard;
  }

  async listDashboards(user: User) {
    const orgId = requireOrgScope(user, user.organizationId);
    return this.dashboards.find({ where: { organizationId: orgId }, order: { updatedAt: 'DESC' } });
  }

  async getDashboard(user: User, id: number) {
    return this.getDashboardRecord(user, id);
  }

  async saveDashboard(user: User, id: number | null, input: { name?: unknown; widgets?: unknown; filters?: unknown }) {
    const orgId = requireOrgScope(user, user.organizationId);
    const errors: string[] = [];
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 120) errors.push('Give the dashboard a name of up to 120 characters');
    if (!Array.isArray(input.widgets) || input.widgets.length > 24) {
      errors.push('A dashboard can have up to 24 widgets');
    } else {
      const seen = new Set<string>();
      input.widgets.forEach((w, i) => {
        const widgetErrors = validateWidget(w);
        if (widgetErrors.length) errors.push(`Widget ${i + 1}: ${widgetErrors.join('; ')}`);
        const wid = (w as { id?: unknown })?.id;
        if (typeof wid === 'string') {
          if (seen.has(wid)) errors.push(`Widget ${i + 1}: duplicate id`);
          seen.add(wid);
        }
      });
    }
    errors.push(...validateFilters(input.filters));
    if (errors.length) throw new BadRequestException(errors);

    const entity = id ? await this.getDashboardRecord(user, id) : this.dashboards.create({ organizationId: orgId, createdByUserId: user.id });
    entity.name = name;
    entity.widgets = input.widgets as WidgetSpec[];
    entity.filters = (input.filters ?? {}) as ReportFilters;
    return this.dashboards.save(entity);
  }

  async deleteDashboard(user: User, id: number): Promise<void> {
    const dashboard = await this.getDashboardRecord(user, id);
    await this.schedules.delete({ dashboardId: dashboard.id });
    await this.dashboards.delete({ id: dashboard.id });
  }

  /** Every widget of a dashboard, computed for the viewer. */
  async dashboardData(user: User, id: number, filters: ReportFilters) {
    const dashboard = await this.getDashboardRecord(user, id);
    const merged: ReportFilters = { ...dashboard.filters, ...filters };
    const widgets: WidgetResult[] = [];
    for (const widget of dashboard.widgets) widgets.push(await this.runWidget(user, widget, merged));
    return { dashboard: { id: dashboard.id, name: dashboard.name, filters: dashboard.filters }, widgets };
  }

  // ---------------------------------------------------------------- scheduled emails

  async listSchedules(user: User) {
    const orgId = requireOrgScope(user, user.organizationId);
    return this.schedules.find({ where: { organizationId: orgId }, order: { createdAt: 'DESC' } });
  }

  private async scheduleInput(user: User, input: Record<string, unknown>) {
    const orgId = requireOrgScope(user, user.organizationId);
    const raw = {
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      hourIst: input.hourIst,
      recipients: input.recipients,
      format: input.format,
      scope: input.scope,
      dashboardId: input.dashboardId ?? null,
    };
    const errors = validateSchedule(raw);
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 120) errors.push('Give the schedule a name of up to 120 characters');
    const rangeDays = Number(input.rangeDays ?? 30);
    if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 365) errors.push('Range must be from 1 to 365 days');
    const filters = (input.filters ?? {}) as ReportFilters;
    errors.push(...validateFilters(filters));
    if (errors.length) throw new BadRequestException(errors);

    // Validated above, so the casts describe what the rules have already checked.
    const spec: ScheduleSpec = {
      frequency: raw.frequency as ScheduleSpec['frequency'],
      dayOfWeek: raw.frequency === 'weekly' ? (raw.dayOfWeek as number) : null,
      dayOfMonth: raw.frequency === 'monthly' ? (raw.dayOfMonth as number) : null,
      hourIst: raw.hourIst as number,
      recipients: (raw.recipients as string[]).map((r) => r.trim()),
      format: raw.format as ScheduleSpec['format'],
      scope: raw.scope as ScheduleSpec['scope'],
      dashboardId: raw.scope === 'dashboard' ? (raw.dashboardId as number) : null,
    };
    if (spec.scope === 'dashboard') {
      const dashboard = await this.dashboards.findOne({ where: { id: spec.dashboardId as number, organizationId: orgId } });
      if (!dashboard) throw new BadRequestException(['That dashboard does not exist']);
    }
    return { name, rangeDays, filters, spec, orgId };
  }

  async createSchedule(user: User, input: Record<string, unknown>) {
    const prepared = await this.scheduleInput(user, input);
    const entity = this.schedules.create({
      organizationId: prepared.orgId,
      createdByUserId: user.id,
      name: prepared.name,
      scope: prepared.spec.scope,
      dashboardId: prepared.spec.dashboardId,
      frequency: prepared.spec.frequency,
      dayOfWeek: prepared.spec.dayOfWeek,
      dayOfMonth: prepared.spec.dayOfMonth,
      hourIst: prepared.spec.hourIst,
      recipients: prepared.spec.recipients,
      format: prepared.spec.format,
      rangeDays: prepared.rangeDays,
      filters: prepared.filters,
      enabled: input.enabled !== false,
      nextRunAt: nextRunAfter(prepared.spec, new Date()),
    });
    return this.schedules.save(entity);
  }

  async updateSchedule(user: User, id: number, input: Record<string, unknown>) {
    const entity = await this.getScheduleRecord(user, id);
    const prepared = await this.scheduleInput(user, input);
    Object.assign(entity, {
      name: prepared.name,
      scope: prepared.spec.scope,
      dashboardId: prepared.spec.dashboardId,
      frequency: prepared.spec.frequency,
      dayOfWeek: prepared.spec.dayOfWeek,
      dayOfMonth: prepared.spec.dayOfMonth,
      hourIst: prepared.spec.hourIst,
      recipients: prepared.spec.recipients,
      format: prepared.spec.format,
      rangeDays: prepared.rangeDays,
      filters: prepared.filters,
      enabled: input.enabled !== false,
      nextRunAt: nextRunAfter(prepared.spec, new Date()),
    });
    return this.schedules.save(entity);
  }

  private async getScheduleRecord(user: User, id: number): Promise<ReportSchedule> {
    const orgId = requireOrgScope(user, user.organizationId);
    const entity = await this.schedules.findOne({ where: { id } });
    if (!entity || entity.organizationId !== orgId) throw new NotFoundException('Schedule not found');
    return entity;
  }

  async deleteSchedule(user: User, id: number): Promise<void> {
    const entity = await this.getScheduleRecord(user, id);
    await this.schedules.delete({ id: entity.id });
  }

  /** Sends one schedule now, outside its timetable. Returns the outcome. */
  async sendNow(user: User, id: number) {
    const entity = await this.getScheduleRecord(user, id);
    return this.deliver(entity, new Date(), user);
  }

  /** Builds the report for a schedule with its creator's data scope and emails it. */
  private async deliver(schedule: ReportSchedule, now: Date, sender?: User) {
    const creator = sender ?? (schedule.createdByUserId ? await this.users.findOne({ where: { id: schedule.createdByUserId }, relations: ['role'] }) : null);
    if (!creator || !creator.isActive) {
      throw new Error('The person who set up this schedule is no longer active');
    }
    const to = istToday(now);
    const filters: ReportFilters = { ...schedule.filters, from: addDays(to, -(schedule.rangeDays - 1)), to };
    const built =
      schedule.scope === 'dashboard' && schedule.dashboardId
        ? await this.dashboardSections(creator, await this.getDashboardRecord(creator, schedule.dashboardId), filters)
        : await this.standardSections(creator, filters);
    const attachment =
      schedule.format === 'csv'
        ? { filename: `${schedule.name}-${to}.csv`.replace(/[^\w.-]+/g, '-'), content: this.toCsvFile(built.sections), contentType: 'text/csv' }
        : {
            filename: `${schedule.name}-${to}.xlsx`.replace(/[^\w.-]+/g, '-'),
            content: await this.toWorkbook(built.sections),
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          };
    const text = `${built.title}\n\nThe report is attached. It covers ${filters.from} to ${filters.to} (IST) and shows only the records the sender can see.`;
    const sent = await this.email.sendMail(
      schedule.recipients.join(', '),
      `${schedule.name}: ${built.title}`,
      text,
      undefined,
      'Lekvya reports',
      schedule.organizationId,
      undefined,
      undefined,
      filters.businessUnitId ?? null,
      [attachment],
    );
    if (!sent) throw new Error('The email could not be sent. Check the sending account for this organization.');
    return { status: 'sent' as const, filename: attachment.filename };
  }

  /**
   * Sends every schedule that is due. Each one is claimed first by moving its next run time, so two
   * workers never send the same report twice.
   */
  async runDueSchedules(now: Date = new Date(), limit = 20): Promise<{ sent: number; failed: number }> {
    const due = await this.schedules.find({
      where: { enabled: true, nextRunAt: LessThanOrEqual(now) },
      order: { nextRunAt: 'ASC' },
      take: limit,
    });
    let sent = 0;
    let failed = 0;
    for (const s of due) {
      const next = nextRunAfter(s, now);
      const claim = await this.schedules.update({ id: s.id, nextRunAt: s.nextRunAt }, { nextRunAt: next, lastRunAt: now });
      if (!claim.affected) continue;
      try {
        await this.deliver(s, now);
        sent++;
        await this.schedules.update(s.id, { lastStatus: 'sent', lastError: null });
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Scheduled report ${s.id} failed: ${message}`);
        await this.schedules.update(s.id, { lastStatus: 'failed', lastError: message.slice(0, 500) });
      }
    }
    return { sent, failed };
  }

  private assertValid(errors: string[], what: string): void {
    if (errors.length) throw new BadRequestException(errors.map((e) => `${what}: ${e}`));
  }
}