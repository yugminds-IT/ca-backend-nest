import { IsIn, IsOptional, IsString, MaxLength, Matches, IsEmail, ValidateIf } from 'class-validator';
import { UNIT_STRUCTURES, UnitStructure } from '../unit-structure';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase alphanumeric and hyphens only' })
  slug?: string;

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

  /** Where to alert on new website form submissions. Empty string clears it, falling back to the admin/SMTP address. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsEmail()
  @MaxLength(255)
  notificationEmail?: string;

  /** Unit and brand layout. Chosen at signup; only a master admin may change it. */
  @IsOptional()
  @IsIn([...UNIT_STRUCTURES])
  unitStructure?: UnitStructure;
}
