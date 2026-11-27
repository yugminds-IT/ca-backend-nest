import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * An industry starter kit: email templates, variables and the starter pipeline.
 * Seeded from code by a migration, then edited by master admins. Signup and the pipeline builder read from here.
 */
@Entity('industry_templates')
export class IndustryTemplate {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  key: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 60, default: 'Building2' })
  icon: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  variables: Array<{ key: string; label: string; example: string }>;

  @Column({ type: 'jsonb', name: 'starterTemplates', default: () => "'[]'" })
  starterTemplates: Array<{ category: string; type: string; name: string; subject: string; body: string }>;

  @Column({ type: 'jsonb', name: 'pipelineStages', default: () => "'[]'" })
  pipelineStages: Array<{ name: string; probability: number; isWon?: boolean; isLost?: boolean }>;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
