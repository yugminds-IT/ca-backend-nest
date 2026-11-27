import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PLAN_KEYS, PlanKey } from '../../billing/plans';
import { UNIT_STRUCTURES, UnitStructure } from '../../organizations/unit-structure';

export class OrganizationSignupOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

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

  /** school | website_developer | ecommerce | healthcare | saas | financial_services | custom */
  @IsString()
  @IsOptional()
  @MaxLength(50)
  industry?: string;

  @IsOptional()
  allowedOrigins?: string[];

  /**
   * The layout: multi_unit, one_unit_multi_brand, one_unit_one_brand or one_unit_no_brand.
   * Omitted means multi_unit, the most open one.
   */
  @IsOptional()
  @IsIn([...UNIT_STRUCTURES])
  unitStructure?: UnitStructure;

  /** starter | growth | premium | enterprise. Omitted means starter. */
  @IsOptional()
  @IsIn([...PLAN_KEYS])
  planKey?: PlanKey;
}

export class OrganizationSignupAdminDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;
}

export class OrganizationSignupDto {
  @ValidateNested()
  @Type(() => OrganizationSignupOrganizationDto)
  organization: OrganizationSignupOrganizationDto;

  @ValidateNested()
  @Type(() => OrganizationSignupAdminDto)
  admin: OrganizationSignupAdminDto;
}
