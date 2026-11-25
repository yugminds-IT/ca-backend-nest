import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from './user.entity';
import { Client } from './client.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pincode: string | null;

  // Per-org SMTP configuration (optional — falls back to global SMTP when null)
  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpHost: string | null;

  @Column({ type: 'int', nullable: true })
  smtpPort: number | null;

  @Column({ type: 'boolean', nullable: true })
  smtpSecure: boolean | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpUser: string | null;

  /** Encrypted SMTP password: used to send mail, never returned in an API response. */
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  smtpPass: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpFrom: string | null;

  /** Where client replies go (Reply-To); null = to the sender */
  @Column({ type: 'varchar', length: 320, nullable: true })
  mailReplyTo: string | null;

  /** Plain-text sign-off added to every email sent to clients; may use {{variables}} */
  @Column({ type: 'text', nullable: true })
  mailSignature: string | null;

  /** Self-service signups start as `pending` until master admin approves. */
  @Column({ type: 'varchar', length: 20, default: 'approved' })
  approvalStatus: 'pending' | 'approved' | 'rejected';

  /** When access ends (trial or extended subscription). Null means not set / legacy. */
  @Column({ type: 'timestamptz', nullable: true })
  accessUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  /** Selected industry: school | website_developer | ecommerce | healthcare | saas | financial_services | custom */
  @Column({ type: 'varchar', length: 50, default: 'custom' })
  industry: string;

  /** Industry-specific settings (brand color, logo URL, default reply-to, custom fields) */
  @Column({ type: 'jsonb', nullable: true })
  industrySettings: Record<string, any> | null;

  /** Whitelisted CORS domains for public contact form submissions */
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  allowedOrigins: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => Client, (client) => client.organization)
  clients: Client[];
}
