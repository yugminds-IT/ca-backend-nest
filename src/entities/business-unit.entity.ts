import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Organization } from './organization.entity';

/**
 * A business unit is one brand, branch, or division inside an organization
 * (for example the five sub-brands of a hospitality group). Every organization has exactly
 * one default unit, created automatically, so single-brand customers never see the concept.
 */
@Entity('business_units')
@Unique(['organizationId', 'slug'])
@Index('uq_business_units_one_default', ['organizationId'], {
  unique: true,
  where: '"isDefault" = true',
})
export class BusinessUnit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  /** Display name. Accents are kept (for example "MÀRE"). */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** ASCII slug, unique within the organization ("MÀRE" becomes "mare"). */
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  brandColor: string | null;

  @Column({ type: 'varchar', length: 60, default: 'Asia/Kolkata' })
  timezone: string;

  /** The unit (place) this brand sits in. Null only for rows created before units existed. */
  @Column('int', { name: 'unitId', nullable: true })
  unitId: number | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /**
   * True for the default brand the system made on its own, named after the organization,
   * until someone edits it. The first brand an admin adds takes it over (see BusinessUnitsService.create),
   * so a company with several brands does not also see its own name listed as a brand.
   */
  @Column({ type: 'boolean', default: false })
  isPlaceholder: boolean;

  /** Admin toggle. When false, the fields below are ignored by quotes, invoices, and email footers. */
  @Column({ type: 'boolean', default: false })
  businessProfileEnabled: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  legalName: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  gstin: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pan: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  invoicePrefix: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
