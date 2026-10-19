import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from './organization.entity';
import { ApiKey } from './api-key.entity';

export type EmailDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'failed'
  | 'bounced';

export type EmailSource = 'api' | 'form' | 'dashboard' | 'schedule';

@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 100, unique: true })
  messageId: string;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'apiKeyId', nullable: true })
  apiKeyId: number | null;

  @Column({ type: 'varchar', length: 255 })
  from: string;

  @Column({ type: 'varchar', length: 255 })
  to: string;

  @Column({ type: 'varchar', length: 500 })
  subject: string;

  @Index()
  @Column({ type: 'varchar', length: 30, default: 'sent' })
  status: EmailDeliveryStatus;

  @Column({ type: 'varchar', length: 30, default: 'api' })
  source: EmailSource;

  @Column('int', { name: 'templateId', nullable: true })
  templateId: number | null;

  @Column({ type: 'jsonb', nullable: true })
  variables: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  openCount: number;

  @Column({ type: 'int', default: 0 })
  clickCount: number;

  @Column({ type: 'timestamp', nullable: true })
  openedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  clickedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => ApiKey, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'apiKeyId' })
  apiKey: ApiKey | null;
}
