import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { FormField } from '../forms/form-rules';

export type FormStatus = 'active' | 'archived';

/**
 * A hosted or embeddable form. Each form owns a public API key (apiKeyId) so submissions go through
 * the same key path as every other intake: domain rules, rate limits, inbox, auto lead.
 */
@Entity('forms')
export class Form {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'businessUnitId' })
  businessUnitId: number;

  @Column('int', { name: 'apiKeyId' })
  apiKeyId: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** Public address: /f/<slug>. Unique across all organizations. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  slug: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  fields: FormField[];

  @Column({ type: 'varchar', length: 60, default: 'Send' })
  submitLabel: string;

  @Column({
    type: 'text',
    default: 'Thank you! We have received your details.',
  })
  successMessage: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: FormStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
