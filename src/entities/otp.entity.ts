import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('otps')
export class Otp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 10 })
  otp: string;

  @Column({ type: 'varchar', length: 50, default: 'password_reset' })
  type: string;

  @Column({ type: 'timestamp', name: 'expiresAt' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
