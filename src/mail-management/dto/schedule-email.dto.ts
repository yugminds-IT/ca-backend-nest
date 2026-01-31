import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsEmail,
  IsObject,
  IsIn,
  ArrayMinSize,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScheduleSlotDto {
  @IsIn(['single_date', 'date_range', 'multiple_dates'])
  type: 'single_date' | 'date_range' | 'multiple_dates';

  /** For single_date: YYYY-MM-DD */
  @IsOptional()
  @IsString()
  date?: string;

  /** For date_range */
  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  /** For multiple_dates: YYYY-MM-DD[] */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dates?: string[];

  /** Times like "09:00", "14:00" (single time = one element) — interpreted in timeZoneOffset if provided */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  times: string[];

  /** User's timezone offset for local time (e.g. "+05:30", "-08:00"). If set, date+time are interpreted in this zone and stored as UTC. */
  @IsOptional()
  @IsString()
  timeZoneOffset?: string;
}

export class ScheduleEmailDto {
  @IsNumber()
  templateId: number;

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
