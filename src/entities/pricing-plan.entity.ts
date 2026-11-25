import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** A pricing card on the marketing site, managed by master admins. */
@Entity('pricing_plans')
export class PricingPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  /** Display text, e.g. "₹499", "Free" or "Custom". */
  @Column({ type: 'varchar', length: 30 })
  price: string;

  @Column({ type: 'varchar', length: 30, default: '/month' })
  period: string;

  @Column({ type: 'text', default: '' })
  description: string;

  /** e.g. "Most Popular" or "Coming Soon". */
  @Column({ type: 'varchar', length: 40, nullable: true })
  badge: string | null;

  /** e.g. "7-day Free Trial". */
  @Column({ type: 'varchar', length: 60, nullable: true })
  trialText: string | null;

  @Column({ type: 'varchar', length: 40 })
  buttonText: string;

  @Column({ type: 'varchar', length: 255 })
  buttonLink: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  features: string[];

  /** Shown as the featured (dark, larger) card. */
  @Column({ type: 'boolean', default: false })
  isHighlighted: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
