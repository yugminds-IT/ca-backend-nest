import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type DeliveryStatus = 'sent' | 'failed' | 'skipped';

/** What happened to one recipient of one send. */
@Entity('email_deliveries')
@Index('UQ_email_deliveries_schedule_email', ['scheduleId', 'email'], { unique: true })
export class EmailDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  scheduleId: number;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  status: DeliveryStatus;

  /** Why it failed or was skipped ("unsubscribed", "bounced", the mail server's error) */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  at: Date;
}
