import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { BusinessType } from './business-type.entity';
import { Service } from './service.entity';
import { ClientDirector } from './client-director.entity';
import { ClientFile } from './client-file.entity';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column('int', { name: 'userId', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'companyName' })
  companyName: string | null;

  @Column('int', { name: 'businessTypeId', nullable: true })
  businessTypeId: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'panNumber' })
  panNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'gstNumber' })
  gstNumber: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'active' })
  status: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pincode: string | null;

  @Column({ type: 'date', nullable: true, name: 'onboardDate' })
  onboardDate: Date | null;

  @Column({ type: 'date', nullable: true, name: 'followupDate' })
  followupDate: Date | null;

  @Column({ type: 'text', nullable: true, name: 'additionalNotes' })
  additionalNotes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, (org) => org.clients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => BusinessType, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'businessTypeId' })
  businessType: BusinessType | null;

  @ManyToMany(() => Service, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'client_services',
    joinColumn: { name: 'clientId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'serviceId', referencedColumnName: 'id' },
  })
  services: Service[];

  @OneToOne(() => User, (user) => user.clientProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @OneToMany(() => ClientDirector, (d) => d.client)
  directors: ClientDirector[];

  @OneToMany(() => ClientFile, (f) => f.client)
  files: ClientFile[];
}
