import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { DataScope } from '../access/permissions';

/** A named set of permissions plus a data scope. Staff are assigned one; presets are seeded per org. */
@Entity('permission_profiles')
@Index(['organizationId', 'name'], { unique: true })
export class PermissionProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  permissions: string[];

  @Column({ type: 'varchar', length: 10, default: 'own' })
  dataScope: DataScope;

  @Column({ type: 'boolean', default: false })
  isPreset: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
