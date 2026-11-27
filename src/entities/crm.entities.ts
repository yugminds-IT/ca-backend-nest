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
import { BusinessUnit } from './business-unit.entity';
import { User } from './user.entity';

/** Converts Postgres numeric (returned as a string) to a JS number. */
const decimalTransformer = {
  to: (v: number | null | undefined) => v,
  from: (v: string | null) => (v == null ? null : parseFloat(v)),
};

export type LeadStatus = 'open' | 'won' | 'lost';
export type LeadActivityType =
  | 'note'
  | 'call'
  | 'email'
  | 'meeting'
  | 'stage_change'
  | 'system'
  | 'email_received'
  | 'email_opened'
  | 'email_clicked'
  | 'sms'
  | 'whatsapp';

/** A sales pipeline inside one business unit. Stages are ordered by `position`. */
@Entity('pipelines')
@Index('ix_pipelines_org_unit', ['organizationId', 'businessUnitId'])
@Index(
  'uq_pipelines_one_default_per_unit',
  ['organizationId', 'businessUnitId'],
  {
    unique: true,
    where: '"isDefault" = true',
  },
)
export class Pipeline {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column('int', { name: 'businessUnitId' })
  businessUnitId: number;

  @ManyToOne(() => BusinessUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessUnitId' })
  businessUnit: BusinessUnit;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('pipeline_stages')
@Index('ix_pipeline_stages_pipeline_position', ['pipelineId', 'position'])
export class PipelineStage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'pipelineId' })
  pipelineId: number;

  @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pipelineId' })
  pipeline: Pipeline;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column('int', { default: 0 })
  position: number;

  /** Default win likelihood (0 to 100) used for forecasts. */
  @Column('int', { default: 0 })
  probability: number;

  /** Moving a lead here marks it won. */
  @Column({ type: 'boolean', default: false })
  isWon: boolean;

  /** Moving a lead here marks it lost. */
  @Column({ type: 'boolean', default: false })
  isLost: boolean;

  /** Off stages stay on leads already in them, but are hidden from the board and the dropdown. */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}

@Entity('leads')
@Index('ix_leads_org_unit_status', [
  'organizationId',
  'businessUnitId',
  'status',
])
@Index('ix_leads_org_email', ['organizationId', 'email'])
@Index('ix_leads_org_phone', ['organizationId', 'phone'])
export class Lead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column('int', { name: 'businessUnitId' })
  businessUnitId: number;

  @ManyToOne(() => BusinessUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessUnitId' })
  businessUnit: BusinessUnit;

  @Column('int', { name: 'pipelineId' })
  pipelineId: number;

  @ManyToOne(() => Pipeline, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pipelineId' })
  pipeline: Pipeline;

  @Column('int', { name: 'stageId' })
  stageId: number;

  @ManyToOne(() => PipelineStage, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stageId' })
  stage: PipelineStage;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Lower-cased and trimmed on write. Used for duplicate detection. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  /** Digits only (country code kept), on write. Used for duplicate detection. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  source: string | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: LeadStatus;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  value: number | null;

  @Column('int', { name: 'ownerUserId', nullable: true })
  ownerUserId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerUserId' })
  owner: User | null;

  /** Free-form tags. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  tags: string[];

  /** Values for the custom fields defined for this unit (Phase 4). Keyed by field key. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  customData: Record<string, unknown>;

  /** Set when the lead came from a web form submission. */
  @Column('int', { name: 'formSubmissionId', nullable: true })
  formSubmissionId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lostReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  nextFollowUpAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastActivityAt: Date | null;

  /** Rules-based score, 0 to 100. Recalculated by automation (Phase 7). */
  @Column('int', { default: 0 })
  score: number;

  /** First-response deadline from the unit's SLA policy. Null when no policy applies. */
  @Column({ type: 'timestamp', nullable: true })
  firstResponseDueAt: Date | null;

  /** When a staff member first replied to the lead. */
  @Column({ type: 'timestamp', nullable: true })
  firstRespondedAt: Date | null;

  /** When the SLA breach was escalated, so it happens once. */
  @Column({ type: 'timestamp', nullable: true })
  slaEscalatedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('lead_activities')
@Index('ix_lead_activities_lead_created', ['leadId', 'createdAt'])
export class LeadActivity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'leadId' })
  leadId: number;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column({ type: 'varchar', length: 24 })
  type: LeadActivityType;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column('int', { name: 'createdByUserId', nullable: true })
  createdByUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('lead_tasks')
@Index('ix_lead_tasks_org_due', ['organizationId', 'dueAt'])
export class LeadTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'leadId' })
  leadId: number;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'timestamp', nullable: true })
  dueAt: Date | null;

  @Column('int', { name: 'assignedToUserId', nullable: true })
  assignedToUserId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column('int', { name: 'createdByUserId', nullable: true })
  createdByUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
