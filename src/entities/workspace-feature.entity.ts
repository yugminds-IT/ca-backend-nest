import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('workspace_features')
export class WorkspaceFeature {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60 })
  key: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 60, default: '' })
  badge: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'Sparkles' })
  icon: string;

  @Column({ type: 'varchar', length: 100, default: 'from-orange-500 to-amber-500' })
  gradient: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  colSpan: string | null;

  @Index()
  @Column({ type: 'int', default: 1 })
  priority: number;

  @Column({ type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lockReason: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
