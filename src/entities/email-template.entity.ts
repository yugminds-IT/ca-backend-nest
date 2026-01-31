import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

@Entity('email_templates')
export class EmailTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  /** Category: service | login | notification | follow_up | reminder */
  @Column({ type: 'varchar', length: 50 })
  category: string;

  /** Type within category, e.g. gst_filing, login_credentials */
  @Column({ type: 'varchar', length: 80 })
  type: string;

  /** Optional display name for the template */
  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 500 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  /** Null = global template (master admin); set = org-specific template */
  @Column('int', { name: 'organizationId', nullable: true })
  organizationId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization | null;
}
