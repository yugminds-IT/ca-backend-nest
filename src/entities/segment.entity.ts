import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { SegmentRule } from '../clients/segment-rules';

/** A saved "group" of contacts: rules, re-checked every time it's used, so new contacts join automatically. */
@Entity('segments')
@Index('UQ_segments_org_name', ['organizationId', 'name'], { unique: true })
export class Segment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  organizationId: number;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  rules: SegmentRule[];

  @Column('int', { nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
