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
import type { AttachmentRef } from '../mail-management/mail-attachments';
import type { ScheduleSegment } from './email-schedule.entity';

export type RecurringScheduleStatus = 'active' | 'stopped' | 'ended';
export type RepeatEvery = 'day' | 'week' | 'month' | 'quarter' | 'year';

@Entity('email_recurring_schedules')
export class EmailRecurringSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'templateId', nullable: true })
  templateId: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'jsonb', name: 'recipientEmails' })
  recipientEmails: string[];

  @Column({ type: 'jsonb', nullable: true })
  variables: Record<string, string> | null;
  /** Month numbers 1–12 */
  @Column({ type: 'jsonb' })
  months: number[];

  /** Day-of-month numbers 1–31; -1 = the last day of the month */
  @Column({ type: 'jsonb' })
  days: number[];

  /** When set, fires on these weekdays (0 = Sun … 6 = Sat) instead of `days` */
  @Column({ type: 'jsonb', nullable: true })
  weekdays: number[] | null;

  /** How the person described it, for display. Null on older monthly repeats. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  frequency: RepeatEvery | null;

  /** First and last local dates it may fire on (YYYY-MM-DD) */
  @Column({ type: 'date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  /** Stop after this many sends */
  @Column('int', { nullable: true })
  maxSends: number | null;

  @Column('int', { default: 0 })
  sentCount: number;

  @Column({ type: 'jsonb', nullable: true })
  recipientVariables: Record<string, Record<string, string>> | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  cc: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  bcc: string | null;

  @Column({ type: 'jsonb', nullable: true })
  attachments: AttachmentRef[] | null;

  @Column({ type: 'jsonb', nullable: true })
  recipientAttachments: Record<string, AttachmentRef[]> | null;

  /** A group, worked out again at every send */
  @Column({ type: 'jsonb', nullable: true })
  segment: ScheduleSegment | null;

  /** Times like "09:00" */
  @Column({ type: 'jsonb' })
  times: string[];

  @Column({ type: 'varchar', length: 10, nullable: true })
  timeZoneOffset: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: RecurringScheduleStatus;

  @Column('int', { name: 'organizationId', nullable: true })
  organizationId: number | null;

  @Column('int', { name: 'createdBy' })
  createdBy: number;

  /** Copied to each month's send, so they list as one email */
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
}
