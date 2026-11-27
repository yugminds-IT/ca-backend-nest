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

  /** Wrong guesses so far. The code is thrown away after MAX_OTP_ATTEMPTS. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
