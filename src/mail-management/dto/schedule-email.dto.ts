import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEmail,
  IsObject,
  IsIn,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScheduleSlotDto {
  @IsIn(['single_date', 'date_range', 'multiple_dates', 'daily', 'weekly', 'monthly'])
  type: 'single_date' | 'date_range' | 'multiple_dates' | 'daily' | 'weekly' | 'monthly';

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
   * For monthly: day of the month to send (1–31).
   * Defaults to the day of fromDate if omitted.
   */
  @IsOptional()
  @IsNumber()
  dayOfMonth?: number;

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

  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  recipientEmails: string[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @ValidateNested()
  @Type(() => ScheduleSlotDto)
  schedule: ScheduleSlotDto;
}
