import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting'] as const;

export class CreateLeadDto {
  /** Required for master admins. Ignored for other roles. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  /** Defaults to the organization's default unit. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  businessUnitId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  pipelineId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  stageId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ownerUserId?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  /**
   * Create even when a lead with the same email or phone already exists in this unit.
   * Otherwise the request is rejected with the matches, so the user can merge instead.
   */
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;

  /** Values for the unit's custom fields, keyed by field key. Validated against the definitions. */
  @IsOptional()
  @IsObject()
  customData?: Record<string, unknown>;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  /** Null clears the value. */
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value?: number | null;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ownerUserId?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string | null;

  /** Partial update: only the keys sent change. Send null or "" to clear a field. */
  @IsOptional()
  @IsObject()
  customData?: Record<string, unknown>;
}

export class MoveLeadDto {
  @IsInt()
  @Type(() => Number)
  stageId: number;

  /** Recorded when the lead moves to a lost stage. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lostReason?: string;
}

export class CreateActivityDto {
  @IsIn(ACTIVITY_TYPES as unknown as string[])
  type: (typeof ACTIVITY_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;
}

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  assignedToUserId?: number | null;
}

export class StageInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  probability?: number;

  @IsOptional()
  @IsBoolean()
  isWon?: boolean;

  @IsOptional()
  @IsBoolean()
  isLost?: boolean;
}

export class CreatePipelineDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  @IsInt()
  @Type(() => Number)
  businessUnitId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => StageInputDto)
  stages: StageInputDto[];
}

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  probability?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddStageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  /** open sits before Won and Lost. won and lost close the lead. */
  @IsOptional()
  @IsIn(['open', 'won', 'lost'])
  outcome?: 'open' | 'won' | 'lost';
}

export class ReorderStagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsInt({ each: true })
  ids: number[];
}

/** Rows are checked one by one in the service, so bad rows are reported instead of failing the file. */
export class ImportLeadsDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  @IsInt()
  @Type(() => Number)
  businessUnitId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsObject({ each: true })
  rows: Record<string, unknown>[];
}
