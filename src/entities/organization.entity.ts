import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
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

  @Column({ type: 'varchar', length: 1000, nullable: true })
  smtpPass: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpFrom: string | null;

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

  /**
   * Chosen at signup. true: an admin panel for several brands (business units), with staff assigned to
   * the brands they may see. false: one branch, and every employee sees its data directly.
   * Only a master admin changes it afterwards. Existing organizations keep the multi-brand behaviour.
   */
  @Column({ type: 'boolean', default: true })
  adminPanelEnabled: boolean;

  /**
   * The layout chosen at signup: multi_unit, one_unit_multi_brand, one_unit_one_brand or
   * one_unit_no_brand (see organizations/unit-structure.ts). adminPanelEnabled is derived from it
   * and kept in sync whenever it changes.
   */
  @Column({ type: 'varchar', length: 30, default: 'multi_unit' })
  unitStructure: string;

  /** Whitelisted CORS domains for public contact form submissions */
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  allowedOrigins: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => Client, (client) => client.organization)
  clients: Client[];
}
