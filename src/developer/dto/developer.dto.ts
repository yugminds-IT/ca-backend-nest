import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
  IsNumber,
  IsInt,
  IsBoolean,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateApiKeyDto {
  /** Create a lead in the key's unit for each accepted submission. */
  @IsOptional()
  @IsBoolean()
  autoCreateLead?: boolean;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['public', 'secret'])
  keyType: 'public' | 'secret';

  @IsArray()
  @IsOptional()
  allowedDomains?: string[];

  @IsNumber()
  @IsOptional()
  rateLimitPerMinute?: number;

  /** Business unit this key's forms belong to. Defaults to the organization's default unit. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  businessUnitId?: number;
}

export class UpdateApiKeyDto {
  /** Create a lead in the key's unit for each accepted submission. */
  @IsOptional()
  @IsBoolean()
  autoCreateLead?: boolean;

  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsOptional()
  allowedDomains?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  rateLimitPerMinute?: number;

  /** Move this key (and its future submissions) to another unit of the same organization. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  businessUnitId?: number;
}

export class SendEmailApiDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsNotEmpty()
  to: string | string[];

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  templateId?: number | string;

  @IsOptional()
  variables?: Record<string, any>;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsArray()
  tags?: { name: string; value: string }[];

  @IsOptional()
  @IsBoolean()
  trackOpens?: boolean;

  @IsOptional()
  @IsBoolean()
  trackClicks?: boolean;
}

export class SendFormSubmissionDto {
  @IsOptional()
  @IsString()
  publicKey?: string;

  @IsOptional()
  @IsString()
  formName?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  message?: string;

  /** Honeypot anti-spam field */
  @IsOptional()
  _honey?: string;

  @IsOptional()
  _gotcha?: string;

  /** Cloudflare Turnstile token */
  @IsOptional()
  @IsString()
  turnstileToken?: string;

  /** Google reCAPTCHA v3 token */
  @IsOptional()
  @IsString()
  recaptchaToken?: string;

  /** Any other dynamic fields */
  [key: string]: any;
}

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsArray()
  events: string[];
}
