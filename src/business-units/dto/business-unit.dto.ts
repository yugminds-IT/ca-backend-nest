import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Indian GSTIN: 15 characters, state code + PAN + entity code + check digit. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** Indian PAN: 5 letters, 4 digits, 1 letter. */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export class CreateBusinessUnitDto {
  /** Required for master admins (they act across organizations). Ignored for other roles. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  /** The unit (place) this brand sits in. Defaults to the organization's default unit. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'brandColor must be a hex color like #1F4E79',
  })
  brandColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  businessProfileEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @IsOptional()
  @Matches(GSTIN_PATTERN, { message: 'GSTIN format is invalid' })
  gstin?: string;

  @IsOptional()
  @Matches(PAN_PATTERN, { message: 'PAN format is invalid' })
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string;

  @IsOptional()
  @Matches(/^[A-Z0-9-]{1,20}$/, {
    message: 'invoicePrefix may use A-Z, 0-9 and hyphen only',
  })
  invoicePrefix?: string;
}

export class UpdateBusinessUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /** Moves the brand to another unit. Its leads, forms and mail move with it. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'brandColor must be a hex color like #1F4E79',
  })
  brandColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  businessProfileEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @IsOptional()
  @Matches(GSTIN_PATTERN, { message: 'GSTIN format is invalid' })
  gstin?: string;

  @IsOptional()
  @Matches(PAN_PATTERN, { message: 'PAN format is invalid' })
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string;

  @IsOptional()
  @Matches(/^[A-Z0-9-]{1,20}$/, {
    message: 'invoicePrefix may use A-Z, 0-9 and hyphen only',
  })
  invoicePrefix?: string;

  /** Deactivating hides the unit from new forms. Records are kept. The default unit cannot be deactivated. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
