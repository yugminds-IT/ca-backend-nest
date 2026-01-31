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

export type EmailScheduleStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

@Entity('email_schedules')
export class EmailSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'templateId' })
  templateId: number;

  /** JSON array of recipient email addresses */
  @Column({ type: 'jsonb', name: 'recipientEmails' })
  recipientEmails: string[];

  /** JSON object for template variable substitution */
  @Column({ type: 'jsonb', nullable: true })
  variables: Record<string, string> | null;

  @Column({ type: 'timestamp', name: 'scheduledAt' })
  scheduledAt: Date;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: EmailScheduleStatus;

  @Column('int', { name: 'organizationId', nullable: true })
  organizationId: number | null;

  @Column('int', { name: 'createdBy' })
  createdBy: number;

  @Column({ type: 'timestamp', name: 'sentAt', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'text', name: 'errorMessage', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => EmailTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: EmailTemplate;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  creator: User;
}
