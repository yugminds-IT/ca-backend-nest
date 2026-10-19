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

export enum TdsFilingStatus {
  DRAFT = 'DRAFT',
  CHALLAN_UPLOADED = 'CHALLAN_UPLOADED',
  EXCEL_UPLOADED = 'EXCEL_UPLOADED',
  COMPARED = 'COMPARED',
  FORM_SELECTED = 'FORM_SELECTED',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('tds_filing_sessions')
export class TdsFilingSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  clientId: number;

  @Column({ type: 'int', nullable: true })
  organizationId: number | null;

  @Column({ type: 'varchar', length: 50, default: TdsFilingStatus.DRAFT })
  status: TdsFilingStatus;

  @Column({ type: 'varchar', length: 10, nullable: true })
  formType: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  formVersion: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  quarter: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  assessmentYear: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  financialYear: string | null;

  @Column({ type: 'jsonb', nullable: true })
  challanData: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  deducteesData: Record<string, any>[] | null;

  @Column({ type: 'jsonb', nullable: true })
  comparisonData: Record<string, any> | null;

  @Column({ type: 'text', array: true, nullable: true })
  selectedSections: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  generatedFiles: Record<string, any> | null;

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
