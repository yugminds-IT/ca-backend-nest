import {
  IsEmail,
  IsOptional,
  IsString,
  IsInt,
  IsIn,
  IsBoolean,
  IsDateString,
  IsArray,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OnboardDirectorDto } from './onboard-client.dto';

const STATUSES = ['active', 'inactive', 'terminated'] as const;

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  businessTypeId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  panNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gstNumber?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  serviceIds?: number[];

  @IsOptional()
  @IsDateString()
  onboardDate?: string;

  @IsOptional()
  @IsDateString()
  followupDate?: string;

  @IsOptional()
  @IsString()
  additionalNotes?: string;

  /** When true, removes the client's login user from DB and clears client.userId. */
  @IsOptional()
  @IsBoolean()
  remove_login?: boolean;

  @IsOptional()
  @IsEmail()
  login_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  login_password?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OnboardDirectorDto)
  directors?: OnboardDirectorDto[];
}
