import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
