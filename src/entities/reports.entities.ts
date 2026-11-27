import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import type { ReportFilters, WidgetSpec } from '../reports/reports.rules';

/** A saved set of widgets. Every widget is computed for the viewer, so a shared dashboard never shows more than they can see. */
@Entity('dashboards')
@Index('ix_dashboards_org', ['organizationId'])
export class Dashboard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column('int', { name: 'createdByUserId', nullable: true })
  createdByUserId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy: User | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  widgets: WidgetSpec[];

  /** Default filters (unit, owner, source, date range). Viewers can change them on screen. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  filters: ReportFilters;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** An emailed report: the standard report pack or a dashboard, as Excel or CSV, on a schedule. */
@Entity('report_schedules')
@Index('ix_report_schedules_due', ['enabled', 'nextRunAt'])
export class ReportSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column('int', { name: 'createdByUserId', nullable: true })
  createdByUserId: number | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 16, default: 'standard' })
  scope: 'standard' | 'dashboard';

  @Column('int', { name: 'dashboardId', nullable: true })
  dashboardId: number | null;

  @Column({ type: 'varchar', length: 12 })
  frequency: 'daily' | 'weekly' | 'monthly';

  @Column('int', { name: 'dayOfWeek', nullable: true })
  dayOfWeek: number | null;

  @Column('int', { name: 'dayOfMonth', nullable: true })
  dayOfMonth: number | null;

  @Column('int', { name: 'hourIst', default: 9 })
  hourIst: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  recipients: string[];

  @Column({ type: 'varchar', length: 8, default: 'xlsx' })
  format: 'xlsx' | 'csv';

  /** Days of data to include, ending today (IST). */
  @Column('int', { name: 'rangeDays', default: 30 })
  rangeDays: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  filters: ReportFilters;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', name: 'nextRunAt' })
  nextRunAt: Date;

  @Column({ type: 'timestamp', name: 'lastRunAt', nullable: true })
  lastRunAt: Date | null;

  @Column({ type: 'varchar', length: 16, name: 'lastStatus', nullable: true })
  lastStatus: 'sent' | 'failed' | null;

  @Column({ type: 'text', name: 'lastError', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
