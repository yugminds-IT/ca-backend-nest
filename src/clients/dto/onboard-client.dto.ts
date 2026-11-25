import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsIn,
  IsDateString,
  IsArray,
  ArrayMaxSize,
  MaxLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { MAX_TAG_LENGTH, MAX_TAGS } from '../tags';
import { Type } from 'class-transformer';
const STATUSES = ['active', 'inactive', 'terminated'] as const;

/** Director item for onboard payload (same shape as CreateDirectorDto) */
export class OnboardDirectorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  directorName: string;

  @ValidateIf((o) => o.email != null && o.email !== '')
  @IsEmail()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  designation?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  din?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  pan?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  aadharNumber?: string;
}

export class OnboardClientDto {
  /** Free labels for grouping ("VIP", "Class 10"); staff-only, a client can't change their own */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  tags?: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  companyName?: string;

  @IsInt()
  @Type(() => Number)
  @IsOptional()
  businessTypeId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  panNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  gstNumber?: string;

  @IsString()
  @IsOptional()
  @IsIn(STATUSES, { message: 'status must be one of: active, inactive, terminated' })
  status?: (typeof STATUSES)[number];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  pincode?: string;

  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  @IsOptional()
  serviceIds?: number[];

  @IsDateString()
  @IsOptional()
  onboardDate?: string;

  @IsDateString()
  @IsOptional()
  followupDate?: string;

  @IsString()
  @IsOptional()
  additionalNotes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsInt()
  @Type(() => Number)
  @IsOptional()
  organizationId?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OnboardDirectorDto)
  directors?: OnboardDirectorDto[];
}

export class CreateDirectorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  directorName: string;

  @ValidateIf((o) => o.email != null && o.email !== '')
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  designation?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  din?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  pan?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  aadharNumber?: string;
}

export class UpdateDirectorDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  directorName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  designation?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  din?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  pan?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  aadharNumber?: string;
}
