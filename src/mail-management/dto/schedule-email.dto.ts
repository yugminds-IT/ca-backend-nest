import {
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  IsArray,
  IsEmail,
  IsObject,
  IsIn,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Matches, MaxLength } from 'class-validator';
import { AttachmentRefDto, BulkRecipientDto, BulkSegmentDto } from './send-bulk.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A repeating email: fires on matching local dates at each of `times` until it ends */
export class RepeatRuleDto {
  @IsIn(['day', 'week', 'month', 'quarter', 'year'])
  every: 'day' | 'week' | 'month' | 'quarter' | 'year';

  /** Months it may fire in, 1–12 (all 12 for daily/weekly/monthly) */
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(12, { each: true })
  months: number[];

  /** Days of the month, 1–31, or -1 for the last day. Ignored when `weekdays` is set. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(-1, { each: true })
  @Max(31, { each: true })
  days?: number[];

  /** 0 = Sunday … 6 = Saturday */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @Matches(DATE)
  startDate: string;

  @IsOptional()
  @Matches(DATE)
  endDate?: string;

  /** Stop after this many sends */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  count?: number;
}

export class ScheduleSlotDto {
  @IsIn(['single_date', 'date_range', 'multiple_dates', 'daily', 'weekly', 'monthly', 'repeat'])
  type: 'single_date' | 'date_range' | 'multiple_dates' | 'daily' | 'weekly' | 'monthly' | 'repeat';

  /** For repeat */
  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatRuleDto)
  repeat?: RepeatRuleDto;

  /** For single_date: YYYY-MM-DD */
  @IsOptional()
  @IsString()
  date?: string;

  /** For date_range / daily / weekly / monthly: start date YYYY-MM-DD */
  @IsOptional()
  @IsString()
  fromDate?: string;

  /** For date_range / daily / weekly / monthly: end date YYYY-MM-DD */
  @IsOptional()
  @IsString()
  toDate?: string;

  /** For multiple_dates: YYYY-MM-DD[] */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dates?: string[];

  /**
   * For weekly: day names to send on.
   * Accepts any common abbreviation or full name, case-insensitive:
   * mon/monday, tue/tues/tuesday, wed/wednesday, thu/thur/thurs/thursday,
   * fri/friday, sat/saturday, sun/sunday.
   * Defaults to all 7 days if omitted.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  days?: string[];

  /**
   * For monthly recurring: month numbers 1–12 (e.g. [1, 6, 12] for Jan, Jun, Dec).
   */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(12, { each: true })
  monthlyMonths?: number[];

  /**
   * For monthly recurring: day-of-month numbers 1–31 (e.g. [1, 15]).
   */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(31, { each: true })
  monthlyDays?: number[];

  /** Times like "09:00", "14:00" — interpreted in timeZoneOffset if provided */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  times: string[];

  /** User's timezone offset (e.g. "+05:30", "-08:00"). Converts local time to UTC. */
  @IsOptional()
  @IsString()
  timeZoneOffset?: string;
}

export class ScheduleEmailDto {
  /** Required for template-based scheduling; omit for custom emails */
  @IsOptional()
  @IsNumber()
  templateId?: number;

  /** Subject — required when no templateId */
  @IsOptional()
  @IsString()
  subject?: string;

  /** Body HTML — required when no templateId */
  @IsOptional()
  @IsString()
  body?: string;

  /** Plain recipient list sharing `variables`. Omit when sending `recipients`. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  /** Many recipients in one call, each with their own variables (preferred). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => BulkRecipientDto)
  recipients?: BulkRecipientDto[];

  /** Everyone matching these rules when each slot goes out (one-off schedules only, not monthly) */
  @IsOptional()
  @ValidateNested()
  @Type(() => BulkSegmentDto)
  segment?: BulkSegmentDto;

  /** Files every recipient gets (one-off schedules only, not monthly) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentRefDto)
  attachments?: AttachmentRefDto[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bcc?: string;

  @ValidateNested()
  @Type(() => ScheduleSlotDto)
  schedule: ScheduleSlotDto;
}
