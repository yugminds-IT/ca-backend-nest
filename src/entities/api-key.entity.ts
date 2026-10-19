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

export type ApiKeyType = 'public' | 'secret';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** 'public' for client-side forms (EmailJS style), 'secret' for backend API (Resend style) */
  @Column({ type: 'varchar', length: 20 })
  keyType: ApiKeyType;

  /** Display prefix e.g. pk_live_4a1... or sk_live_8f2... */
  @Column({ type: 'varchar', length: 30 })
  keyPrefix: string;

  /** SHA-256 or bcrypt hash of the secret key (for secret keys) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  keyHash: string | null;

  /** Plaintext public key for client-side form submissions (EmailJS style) */
  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  publicKey: string | null;

  /** Whitelisted origins / domains allowed to submit using this public key */
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  allowedDomains: string[];

  @Column({ type: 'int', default: 60 })
  rateLimitPerMinute: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
