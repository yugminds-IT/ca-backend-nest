import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** A group of staff. A team can sit under a parent team and have one manager. */
@Entity('teams')
@Index(['organizationId', 'name'], { unique: true })
export class Team {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** The team this one sits under. Null for a top-level team. */
  @Column('int', { name: 'parentTeamId', nullable: true })
  parentTeamId: number | null;

  /** The staff member who manages this team. */
  @Column('int', { name: 'managerUserId', nullable: true })
  managerUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
