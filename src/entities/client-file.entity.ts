import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from './client.entity';

@Entity('client_files')
export class ClientFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'clientId' })
  clientId: number;

  @Column({ type: 'varchar', length: 255, name: 'fileName' })
  fileName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  type: string | null;

  @Column({ type: 'varchar', length: 20 })
  format: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'mimeType' })
  mimeType: string | null;

  @Column({ type: 'int', nullable: true, name: 'fileSize' })
  fileSize: number | null;

  @Column({ type: 'varchar', length: 500, name: 's3Key' })
  s3Key: string;

  @Column({ type: 'varchar', length: 255, name: 's3Bucket' })
  s3Bucket: string;

  @Column({ type: 'timestamp', name: 'uploadedAt', default: () => 'CURRENT_TIMESTAMP' })
  uploadedAt: Date;

  @ManyToOne(() => Client, (c) => c.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: Client;
}
