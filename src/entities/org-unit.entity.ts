import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

/**
 * A unit is a place inside an organization: a plant, an office, a city (for example "Shamshabad").
 * Brands (business_units) sit inside a unit and own the leads, forms and mail. An organization
 * always has one default unit, created on demand, so single-unit customers never see the concept.
 */
@Entity('org_units')
@Index('uq_org_units_one_default', ['organizationId'], {
  unique: true,
  where: '"isDefault" = true',
})
export class OrgUnit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  city: string | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}

/** Staff assigned to a whole unit: they see every brand in it, including brands added later. */
@Entity('user_org_units')
export class UserOrgUnit {
  @PrimaryColumn('int', { name: 'userId' })
  userId: number;

  @PrimaryColumn('int', { name: 'orgUnitId' })
  orgUnitId: number;

  @CreateDateColumn()
  createdAt: Date;
}
