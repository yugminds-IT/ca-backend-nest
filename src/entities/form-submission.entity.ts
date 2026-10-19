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

export type FormSubmissionStatus = 'new' | 'read' | 'replied' | 'converted' | 'spam';

@Entity('form_submissions')
export class FormSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'apiKeyId', nullable: true })
  apiKeyId: number | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  formName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  senderName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  senderEmail: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  senderPhone: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  /** All fields submitted from the HTML / frontend form */
  @Column({ type: 'jsonb' })
  data: Record<string, any>;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  origin: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'new' })
  status: FormSubmissionStatus;

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
