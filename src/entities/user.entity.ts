import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Role } from './role.entity';
import { Organization } from './organization.entity';
import { Client } from './client.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, name: 'passwordHash', select: false })
  passwordHash: string;

  /** Encrypted plain password for client accounts; used to show password until user changes it. Cleared on reset-password. */
  @Column({ type: 'varchar', length: 512, name: 'encrypted_plain_password', nullable: true, select: false })
  encryptedPlainPassword: string | null;

  @Column('int', { name: 'roleId' })
  roleId: number;

  @Column('int', { name: 'organizationId', nullable: true })
  organizationId: number | null;

  /** Staff permission profile. Null means the legacy access for the role (see access/permissions.ts). */
  @Column('int', { name: 'profileId', nullable: true })
  profileId: number | null;

  /** The team this staff member belongs to. Managers of a team see its members' records (team scope). */
  @Column('int', { name: 'teamId', nullable: true })
  teamId: number | null;

  /** Deactivated staff cannot sign in and their existing tokens stop working. */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Role, (role) => role.users, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'roleId' })
  role: Role;

  @ManyToOne(() => Organization, (org) => org.users, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization | null;

  @OneToOne(() => Client, (client) => client.user, { nullable: true })
  clientProfile: Client | null;
}
