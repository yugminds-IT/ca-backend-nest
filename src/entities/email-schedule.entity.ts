import type { AttachmentRef } from '../mail-management/mail-attachments';
import type { SegmentRule } from '../clients/segment-rules';

/** A send to a group: the rules, and once it goes out, when and how many matched */
export interface ScheduleSegment {
  rules: SegmentRule[];
  excludeIds: number[];
  tzOffsetMinutes: number;
  fallbacks: Record<string, string>;
  label: string | null;
  resolvedAt?: string;
  matched?: number;
}
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EmailTemplate } from './email-template.entity';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { EmailRecurringSchedule } from './email-recurring-schedule.entity';

export type EmailScheduleStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';

@Entity('email_schedules')
export class EmailSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'templateId', nullable: true })
  templateId: number | null;

  /** Subject line — populated for custom emails (no template) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  /** Body HTML — populated for custom emails (no template) */
  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'jsonb', name: 'recipientEmails' })
  recipientEmails: string[];

  /** JSON object for template variable substitution */
  @Column({ type: 'jsonb', nullable: true })
  variables: Record<string, string> | null;

  /** Bulk sends: per-recipient variables keyed by email, merged over `variables`. */
  @Column({ type: 'jsonb', name: 'recipientVariables', nullable: true })
  recipientVariables: Record<string, Record<string, string>> | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  cc: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  bcc: string | null;

  /** Files every recipient gets (S3 refs) */
  @Column({ type: 'jsonb', nullable: true })
  attachments: AttachmentRef[] | null;

  /** Files per recipient, keyed by lower-cased email */
  @Column({ type: 'jsonb', nullable: true })
  recipientAttachments: Record<string, AttachmentRef[]> | null;

  /** Sent to a group: matching contacts are added to recipientEmails when it goes out (resolvedAt set then) */
  @Column({ type: 'jsonb', nullable: true })
  segment: ScheduleSegment | null;

  /** Recipients already attempted; lets an interrupted send resume instead of restarting. */
  @Column('int', { default: 0 })
  progress: number;

  @Column({ type: 'timestamptz', name: 'scheduledAt' })
  scheduledAt: Date;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: EmailScheduleStatus;

  @Column('int', { name: 'organizationId', nullable: true })
  organizationId: number | null;

  @Column('int', { name: 'createdBy' })
  createdBy: number;

  @Column({ type: 'timestamptz', name: 'sentAt', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'text', name: 'errorMessage', nullable: true })
  errorMessage: string | null;

  @Column('int', { name: 'recurringScheduleId', nullable: true })
  recurringScheduleId: number | null;

  /** Every send of one email shares this: the time slots of a schedule, each month of a repeat, resends */
  @Column({ type: 'uuid', nullable: true })
  batchId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => EmailTemplate, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'templateId' })
  template: EmailTemplate | null;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @ManyToOne(() => EmailRecurringSchedule, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'recurringScheduleId' })
  recurringSchedule: EmailRecurringSchedule | null;
}
