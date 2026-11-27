import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Who changed what in the staff and access settings. Kept far longer than activity logs (which are
 * purged after 48 hours), so admins can look back at changes.
 */
@Entity('audit_events')
@Index(['organizationId', 'createdAt'])
export class AuditEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'actorUserId', nullable: true })
  actorUserId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actorName: string | null;

  /** e.g. staff.invited, staff.updated, profile.updated, team.created */
  @Column({ type: 'varchar', length: 60 })
  action: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  targetType: string | null;

  @Column('int', { name: 'targetId', nullable: true })
  targetId: number | null;

  @Column({ type: 'varchar', length: 500 })
  summary: string;

  @CreateDateColumn()
  createdAt: Date;
}
