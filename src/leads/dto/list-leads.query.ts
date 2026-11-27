import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListLeadsQuery {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  /** Omit for all units of the organization. */
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

  @IsOptional()
  @IsIn(['open', 'won', 'lost'])
  status?: 'open' | 'won' | 'lost';

  /** A user id, or "none" for unassigned leads. Arrives as a string from the query. */
  @IsOptional()
  @IsString()
  @MaxLength(12)
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Next follow-up in [followUpFrom, followUpTo). ISO dates, used by the calendar. */
  @IsOptional()
  @IsDateString()
  followUpFrom?: string;

  @IsOptional()
  @IsDateString()
  followUpTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;
}
