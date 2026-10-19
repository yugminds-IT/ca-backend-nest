import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { Contact } from './contact.entity';

@Entity('contact_lists')
export class ContactList {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToMany(() => Contact, (contact) => contact.lists)
  contacts: Contact[];
}
