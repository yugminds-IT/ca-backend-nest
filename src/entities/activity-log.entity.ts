import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('activity_logs')
export class ActivityLog {
  @PrimaryGeneratedColumn()
  id: number;

  /** login | logout | login_failed | error | info */
  @Column({ type: 'varchar', length: 50 })
  @Index()
  type: string;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userEmail: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  userRole: string | null;

  @Column({ type: 'int', nullable: true })
  organizationId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  orgName: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  path: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  /** Request duration (ms) or session duration (ms) for logout events */
  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'boolean', default: false })
  isError: boolean;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
