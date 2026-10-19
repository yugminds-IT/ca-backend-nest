import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from '../entities/client.entity';

export enum GstFilingStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  UPLOADED = 'UPLOADED',
  COMPARED = 'COMPARED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('gst_filing_sessions')
export class GstFilingSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  clientId: number;

  @Column({ type: 'int', nullable: true })
  organizationId: number | null;

  @Column({ type: 'varchar', length: 50, default: GstFilingStatus.DRAFT })
  status: GstFilingStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  documentName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  documentType: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  financialYear: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  period: string | null;

  @Column({ type: 'jsonb', nullable: true })
  extractedData: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  comparisonData: Record<string, any> | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  celeryTaskId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'clientId' })
  client: Client;
}
