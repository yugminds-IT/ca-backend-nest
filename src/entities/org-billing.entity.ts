import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** One row per organization: its plan, module overrides and this month's AI credit use. */
@Entity('org_billing')
export class OrgBilling {
  @PrimaryColumn('int', { name: 'organizationId' })
  organizationId: number;

  @Column({ type: 'varchar', length: 20, default: 'starter', name: 'planKey' })
  planKey: string;

  @Column({ type: 'jsonb', default: () => "'{}'", name: 'moduleOverrides' })
  moduleOverrides: Record<string, boolean>;

  @Column('int', { name: 'aiCreditsUsed', default: 0 })
  aiCreditsUsed: number;

  /** Month the AI credit counter belongs to, YYYY-MM (India time). */
  @Column({ type: 'varchar', length: 7, name: 'aiPeriod', default: '' })
  aiPeriod: string;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
