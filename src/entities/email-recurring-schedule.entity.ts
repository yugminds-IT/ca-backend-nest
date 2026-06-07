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

export type RecurringScheduleStatus = 'active' | 'stopped';

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

  /** Day-of-month numbers 1–31 */
  @Column({ type: 'jsonb' })
  days: number[];

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
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
