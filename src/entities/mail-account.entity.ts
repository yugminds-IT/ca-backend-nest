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
import { BusinessUnit } from './business-unit.entity';

/**
 * An outbound SMTP account. Scope:
 * - businessUnitId set: used for that unit's mail.
 * - businessUnitId null: organization-wide account, used when a unit has none.
 *
 * Passwords are stored AES-256-GCM encrypted (see crypto.util) and never returned by the API.
 * whiteLabel: when true, the "Email sent via Lekvya" footer is not added to mail from this account.
 */
@Entity('mail_accounts')
@Index('uq_mail_accounts_one_active_org_wide', ['organizationId'], {
  unique: true,
  where: '"isActive" = true AND "businessUnitId" IS NULL',
})
@Index(
  'uq_mail_accounts_one_active_per_unit',
  ['organizationId', 'businessUnitId'],
  {
    unique: true,
    where: '"isActive" = true AND "businessUnitId" IS NOT NULL',
  },
)
export class MailAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column('int', { name: 'businessUnitId', nullable: true })
  businessUnitId: number | null;

  @ManyToOne(() => BusinessUnit, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessUnitId' })
  businessUnit: BusinessUnit | null;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 255 })
  host: string;

  @Column('int', { default: 587 })
  port: number;

  @Column({ type: 'boolean', default: false })
  secure: boolean;

  @Column({ type: 'varchar', length: 255 })
  username: string;

  /** AES-256-GCM "iv:tag:cipher". Never serialized to clients. */
  @Column({ type: 'text' })
  passwordEncrypted: string;

  @Column({ type: 'varchar', length: 255 })
  fromEmail: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fromName: string | null;

  /** Skip the "Email sent via Lekvya" footer for mail sent from this account. */
  @Column({ type: 'boolean', default: false })
  whiteLabel: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastVerifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
