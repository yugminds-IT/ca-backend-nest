import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FORM_FIELD_TYPES, MAX_FORM_FIELDS } from '../form-rules';

export class FormFieldDto {
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z][a-z0-9_]{0,39}$/, {
    message: 'key must start with a letter and use lowercase letters, digits and underscores',
  })
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;

  @IsIn(FORM_FIELD_TYPES as unknown as string[])
  type: string;

  @IsBoolean()
  required: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  placeholder?: string;

  @IsOptional()
  @IsIn(['name', 'email', 'phone', 'message', null])
  role?: 'name' | 'email' | 'phone' | 'message' | null;
}

export class CreateFormDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  organizationId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  businessUnitId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @IsArray()
  @ArrayMaxSize(MAX_FORM_FIELDS)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields: FormFieldDto[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  submitLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  successMessage?: string;

  @IsOptional()
  @IsBoolean()
  autoCreateLead?: boolean;
}

export class UpdateFormDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  businessUnitId?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FORM_FIELDS)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields?: FormFieldDto[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  submitLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  successMessage?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';

  @IsOptional()
  @IsBoolean()
  autoCreateLead?: boolean;
}
