import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { Client } from './client.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pincode: string | null;

  // Per-org SMTP configuration (optional — falls back to global SMTP when null)
  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpHost: string | null;

  @Column({ type: 'int', nullable: true })
  smtpPort: number | null;

  @Column({ type: 'boolean', nullable: true })
  smtpSecure: boolean | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpUser: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  smtpPass: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpFrom: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => Client, (client) => client.organization)
  clients: Client[];
}
