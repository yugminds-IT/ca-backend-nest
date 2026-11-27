import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMailAccountDto {
  /** Required for master admins (they act across organizations). Ignored for other roles. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  /** Null or omitted: organization-wide account. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  businessUnitId?: number | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  port: number;

  @IsBoolean()
  secure: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username: string;

  /** Stored encrypted. Never returned. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  password: string;

  @IsEmail()
  @MaxLength(255)
  fromEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromName?: string | null;

  /** Skip the "Email sent via Lekvya" footer for mail from this account. */
  @IsOptional()
  @IsBoolean()
  whiteLabel?: boolean;
}

export class UpdateMailAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username?: string;

  /** Omit to keep the stored password. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  password?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  fromEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fromName?: string | null;

  @IsOptional()
  @IsBoolean()
  whiteLabel?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
