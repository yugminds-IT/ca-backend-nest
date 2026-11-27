import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { BusinessUnit } from './business-unit.entity';
import { Client } from './client.entity';

export const CUSTOM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'email',
  'phone',
  'url',
  'select',
  'radio',
  'multiselect',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/**
 * A custom field definition for one entity in one business unit (today: leads).
 * Values live in the entity's `customData` JSON, keyed by `key`.
 */
@Entity('custom_field_definitions')
@Index('uq_custom_field_key', ['organizationId', 'businessUnitId', 'entityType', 'key'], { unique: true })
export class CustomFieldDefinition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column('int', { name: 'businessUnitId' })
  businessUnitId: number;

  @ManyToOne(() => BusinessUnit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessUnitId' })
  businessUnit: BusinessUnit;

  @Column({ type: 'varchar', length: 24, default: 'lead' })
  entityType: 'lead';

  /** Stable identifier used in customData and the API. snake_case. */
  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 24 })
  fieldType: CustomFieldType;

  /** Choices for select, radio and multiselect. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  options: string[];

  @Column({ type: 'boolean', default: false })
  required: boolean;

  @Column('int', { default: 0 })
  position: number;

  /** Layout section the field appears under, for example "Trip details". */
  @Column({ type: 'varchar', length: 80, default: 'Details' })
  section: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  helpText: string | null;

  /** Show this field only when another field equals a value. Null = always shown. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  showIfKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  showIfValue: string | null;

  /** Roles that may see the field. Empty = every staff role. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  visibleToRoles: string[];

  /** Roles that may change the field. Empty = every staff role. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  editableByRoles: string[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** An organization-wide (or unit-scoped) variable such as {{meeting_link}} for email templates. */
@Entity('custom_variables')
@Index('uq_custom_variables_org_key', ['organizationId', 'key'], { unique: true })
export class CustomVariable {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  /** Null = usable in every unit. */
  @Column('int', { name: 'businessUnitId', nullable: true })
  businessUnitId: number | null;

  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'text', default: '' })
  defaultValue: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** One client's value for a variable. A missing row means "use the default". */
@Entity('custom_variable_values')
@Index('uq_custom_variable_values', ['variableId', 'clientId'], { unique: true })
export class CustomVariableValue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { name: 'organizationId' })
  organizationId: number;

  @Column('int', { name: 'variableId' })
  variableId: number;

  @ManyToOne(() => CustomVariable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variableId' })
  variable: CustomVariable;

  @Column('int', { name: 'clientId' })
  clientId: number;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
