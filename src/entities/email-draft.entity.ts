import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** An unsent email, autosaved from Send Mails. Private to the person who wrote it. */
@Entity('email_drafts')
@Index('IDX_email_drafts_creator', ['createdBy', 'updatedAt'])
export class EmailDraft {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { nullable: true })
  organizationId: number | null;

  @Column('int')
  createdBy: number;

  /** Shown in lists: the subject, or "Untitled email" */
  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** Everything on the Send Mails page (audience, message, values, attachment references), as the browser saved it */
  @Column({ type: 'jsonb' })
  data: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
