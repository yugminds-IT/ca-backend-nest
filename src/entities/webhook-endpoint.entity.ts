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

@Entity('webhook_endpoints')
export class WebhookEndpoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  /** Secret key for generating HMAC-SHA256 signature in X-CAA-Signature header */
  @Column({ type: 'varchar', length: 150 })
  secret: string;

  /** Event subscriptions e.g. ['email.sent', 'email.delivered', 'email.opened', 'form.submitted'] */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  events: string[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
