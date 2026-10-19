import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
  IsNumber,
  IsBoolean,
  IsEmail,
} from 'class-validator';

export class CreateApiKeyDto {
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
}

export class UpdateApiKeyDto {
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
