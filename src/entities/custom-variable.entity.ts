import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** An org's own template variable, e.g. {{meeting_link}}. Filled per client, else defaultValue. */
@Entity('custom_variables')
@Index(['organizationId', 'key'], { unique: true })
export class CustomVariable {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  organizationId: number;

  /** snake_case name used in {{ }}; fixed after creation so templates don't break */
  @Column({ type: 'varchar', length: 60 })
  key: string;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ type: 'text', default: '' })
  defaultValue: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** One client's value for one custom variable. */
@Entity('client_custom_values')
@Index(['clientId', 'variableId'], { unique: true })
export class ClientCustomValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  clientId: number;

  @Index()
  @Column('int')
  variableId: number;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
