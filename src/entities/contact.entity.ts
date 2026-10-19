import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from './organization.entity';
import { ContactList } from './contact-list.entity';

export type ContactStatus = 'subscribed' | 'unsubscribed' | 'bounced';

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  /** Dynamic attributes (e.g., student_name, grade, order_id, company, roll_no) */
  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
  attributes: Record<string, any>;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'subscribed' })
  status: ContactStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToMany(() => ContactList, (list) => list.contacts)
  @JoinTable({
    name: 'contact_list_memberships',
    joinColumn: { name: 'contactId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'listId', referencedColumnName: 'id' },
  })
  lists: ContactList[];
}
