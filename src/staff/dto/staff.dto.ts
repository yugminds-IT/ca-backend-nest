import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class InviteStaffDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsIn(['CAA', 'ORG_EMPLOYEE', 'ORG_ADMIN'])
  roleName?: 'CAA' | 'ORG_EMPLOYEE' | 'ORG_ADMIN';

  @IsOptional()
  @IsInt()
  @Min(1)
  profileId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  businessUnitIds?: number[];

  /** Whole units: the person sees every brand in them, including brands added later. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  orgUnitIds?: number[];

  @IsOptional()
  @IsIn(['email', 'temporary_password'])
  mode?: 'email' | 'temporary_password';

  @IsOptional()
  @IsInt()
  @Min(1)
  teamId?: number;
}

export class BulkInviteStaffDto {
  /** Pasted CSV with a header row: name, email, and optionally role and profile. */
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  csv: string;

  /** Used for rows that do not name a profile. */
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultProfileId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  businessUnitIds?: number[];

  /** Whole units: the person sees every brand in them, including brands added later. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  orgUnitIds?: number[];

  @IsOptional()
  @IsIn(['email', 'temporary_password'])
  mode?: 'email' | 'temporary_password';

  @IsOptional()
  @IsInt()
  @Min(1)
  teamId?: number;
}

export class UpdateStaffDto {
  /** Pass null to remove the profile (back to legacy access). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  profileId?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  businessUnitIds?: number[];

  /** Whole units: the person sees every brand in them, including brands added later. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  orgUnitIds?: number[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Pass null to take them out of their team. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  teamId?: number | null;

  /** When deactivating: give their leads to this staff member. Omit to leave them unowned. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  reassignTo?: number | null;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
