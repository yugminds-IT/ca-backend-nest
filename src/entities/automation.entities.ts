import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type AssignmentStrategy = 'round_robin' | 'load_balanced' | 'by_field';
export type WorkflowTrigger = 'lead_created' | 'stage_changed' | 'field_changed' | 'lead_inactive' | 'followup_overdue';
export type EnrollmentStatus = 'active' | 'completed' | 'stopped';

/** Who gets a new lead when nobody is picked. Per unit, tried in priority order. */
@Entity('assignment_rules')
@Index('ix_assignment_rules_org_unit', ['organizationId', 'businessUnitId'])
export class AssignmentRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'businessUnitId' })
  businessUnitId: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  strategy: AssignmentStrategy;

  /** Lower runs first. */
  @Column('int', { default: 100 })
  priority: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** Staff this rule may pick from. Empty means every active staff member in the unit. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  memberUserIds: number[];

  /** by_field only: a lead field and the value that matches. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  conditionField: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  conditionValue: string | null;

  /** by_field only: who gets matching leads. */
  @Column('int', { name: 'targetUserId', nullable: true })
  targetUserId: number | null;

  /** round_robin only: the last person given a lead. */
  @Column('int', { name: 'cursorUserId', nullable: true })
  cursorUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** If this, then that: a trigger, optional conditions, and actions to run. */
@Entity('workflow_rules')
@Index('ix_workflow_rules_org_trigger', ['organizationId', 'trigger'])
export class WorkflowRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  /** Null means every unit. */
  @Column('int', { name: 'businessUnitId', nullable: true })
  businessUnitId: number | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  trigger: WorkflowTrigger;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  triggerConfig: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  conditions: Array<{ field: string; op: string; value?: string | number | null }>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  actions: Array<Record<string, unknown> & { type: string }>;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** One line per rule that fired for a lead. Used for the run history and to avoid repeating time-based rules. */
@Entity('workflow_runs')
@Index('ix_workflow_runs_rule_lead', ['ruleId', 'leadId'])
export class WorkflowRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'ruleId' })
  ruleId: number;

  @Column('int', { name: 'leadId' })
  leadId: number;

  @Column({ type: 'varchar', length: 32 })
  trigger: WorkflowTrigger;

  @Column({ type: 'varchar', length: 16 })
  status: 'ok' | 'failed';

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** A multi-step follow-up for leads: emails and tasks spaced out in days. */
@Entity('sequences')
@Index('ix_sequences_org_unit', ['organizationId', 'businessUnitId'])
export class Sequence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'businessUnitId' })
  businessUnitId: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'boolean', default: true })
  stopOnStageChange: boolean;

  @Column({ type: 'boolean', default: true })
  stopOnReply: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  steps: Array<{
    delayDays: number;
    kind: 'email' | 'task';
    templateId?: number | null;
    subject?: string | null;
    body?: string | null;
    taskTitle?: string | null;
  }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** A lead moving through a sequence. */
@Entity('sequence_enrollments')
@Index('ix_sequence_enrollments_due', ['status', 'nextStepAt'])
@Index('uq_sequence_enrollments_active', ['sequenceId', 'leadId'], {
  unique: true,
  where: `"status" = 'active'`,
})
export class SequenceEnrollment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'sequenceId' })
  sequenceId: number;

  @Column('int', { name: 'leadId' })
  leadId: number;

  /** Index of the next step to run. */
  @Column('int', { default: 0 })
  currentStep: number;

  @Column({ type: 'timestamp', nullable: true })
  nextStepAt: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: EnrollmentStatus;

  @Column({ type: 'varchar', length: 40, nullable: true })
  stopReason: string | null;

  @Column('int', { name: 'enrolledByUserId', nullable: true })
  enrolledByUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Per-unit first-response target. An escalation task goes to the manager when it is missed. */
@Entity('sla_policies')
@Index('ix_sla_policies_org_unit', ['organizationId', 'businessUnitId'], { unique: true })
export class SlaPolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'businessUnitId' })
  businessUnitId: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column('int', { default: 60 })
  firstResponseMinutes: number;

  /** Escalate to this person. Null means the owner's team manager. */
  @Column('int', { name: 'escalateToUserId', nullable: true })
  escalateToUserId: number | null;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Adds or removes points when a condition holds. Scores are clamped to 0 to 100. */
@Entity('scoring_rules')
@Index('ix_scoring_rules_org_unit', ['organizationId', 'businessUnitId'])
export class ScoringRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'businessUnitId' })
  businessUnitId: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 60 })
  field: string;

  @Column({ type: 'varchar', length: 12 })
  op: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  value: string | null;

  @Column('int')
  points: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
