import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CUSTOM_FIELD_TYPES } from '../../entities/custom-fields.entities';

/** Roles that can be named in visibility and edit lists. Client-portal users are never staff. */
export const FIELD_ROLES = ['ORG_ADMIN', 'CAA', 'ORG_EMPLOYEE'] as const;

export class CreateCustomFieldDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  /** Defaults to the organization's default unit. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  businessUnitId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  /** Optional. Generated from the label when omitted. Cannot change after creation. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;

  @IsIn([...CUSTOM_FIELD_TYPES])
  fieldType: (typeof CUSTOM_FIELD_TYPES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  section?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  helpText?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/, { message: 'showIfKey must be a field key' })
  showIfKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  showIfValue?: string;

  @IsOptional()
  @IsArray()
  @IsIn([...FIELD_ROLES], { each: true })
  visibleToRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsIn([...FIELD_ROLES], { each: true })
  editableByRoles?: string[];
}

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label?: string;

  /** Only to a type in the same group (text/long text, dropdown/radio). Checked by the service. */
  @IsOptional()
  @IsIn([...CUSTOM_FIELD_TYPES])
  fieldType?: (typeof CUSTOM_FIELD_TYPES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  section?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  helpText?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/, { message: 'showIfKey must be a field key' })
  showIfKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  showIfValue?: string | null;

  @IsOptional()
  @IsArray()
  @IsIn([...FIELD_ROLES], { each: true })
  visibleToRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsIn([...FIELD_ROLES], { each: true })
  editableByRoles?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  @Type(() => Number)
  position?: number;
}

export class ReorderCustomFieldsDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  @IsInt()
  @Type(() => Number)
  businessUnitId: number;

  /** Field ids in their new order. Must be exactly the unit's active fields. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Type(() => Number)
  ids: number[];
}

export class CreateCustomVariableDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  /** Omit or null: usable in every unit. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  businessUnitId?: number | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  defaultValue?: string;
}

export class UpdateCustomVariableDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  defaultValue?: string;
}

export class SetClientVariablesDto {
  /** key -> value. An empty string clears the client's value so the default applies. */
  @IsObject()
  values: Record<string, string>;
}
