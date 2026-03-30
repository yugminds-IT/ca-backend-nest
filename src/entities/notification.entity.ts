import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { Client } from './client.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, default: 'document_upload' })
  type: string;

  @Column('int', { nullable: true })
  organizationId: number | null;

  @Column('int', { nullable: true })
  clientId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  clientName: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  fileName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fileType: string | null;

  @Column({ type: 'int', nullable: true })
  fileSize: number | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization | null;

  @ManyToOne(() => Client, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'clientId' })
  client: Client | null;
}
