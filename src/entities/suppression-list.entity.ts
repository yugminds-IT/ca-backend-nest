import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from './organization.entity';

export type SuppressionReason =
  | 'unsubscribed'
  | 'hard_bounce'
  | 'complaint'
  | 'manual';

@Entity('suppression_list')
export class SuppressionList {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Index()
  @Column({ type: 'varchar', length: 30, default: 'unsubscribed' })
  reason: SuppressionReason;

  @Column({ type: 'varchar', length: 150, nullable: true })
  source: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
