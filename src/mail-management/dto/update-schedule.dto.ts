import { IsOptional, IsString, IsArray, ArrayMinSize, IsEmail, IsObject } from 'class-validator';

export class UpdateScheduleDto {
  /** New scheduled datetime as ISO 8601 string (e.g. "2025-06-15T10:30:00.000Z") */
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  /** Subject line (only for custom emails, not template-based) */
  @IsOptional()
  @IsString()
  subject?: string;

  /** HTML body (only for custom emails, not template-based) */
  @IsOptional()
  @IsString()
  body?: string;
}
