import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrgUnitDto {
  /** Required for master admins (they act across organizations). Ignored for other roles. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  city?: string;
}

export class UpdateOrgUnitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  /** An empty string clears the city. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  city?: string;

  /** Deactivating needs the unit to have no active brands. The default unit cannot be deactivated. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
