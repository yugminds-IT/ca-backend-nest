import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Client } from './client.entity';

@Entity('client_directors')
export class ClientDirector {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'clientId' })
  clientId: number;

  @Column({ type: 'varchar', length: 255, name: 'directorName' })
  directorName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  designation: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  din: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pan: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'aadharNumber' })
  aadharNumber: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Exclude()
  @ManyToOne(() => Client, (c) => c.directors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: Client;
}
