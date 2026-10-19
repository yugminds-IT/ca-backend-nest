import { IsEmail, IsNumber, IsOptional, IsObject, IsString } from 'class-validator';

/** Variable key without braces, e.g. client_name. Values are strings. */
export class SendTemplateEmailDto {
  @IsEmail()
  to: string;

  /** Optional CC email(s), comma-separated */
  @IsOptional()
  @IsString()
  cc?: string;

  /** Optional BCC email(s), comma-separated */
  @IsOptional()
  @IsString()
  bcc?: string;

  /** templateId OR (subject + body) must be provided. */
  @IsOptional()
  @IsNumber()
  templateId?: number;

  /** Used when sending a custom email without a template. */
  @IsOptional()
  @IsString()
  subject?: string;

  /** Used when sending a custom email without a template. */
  @IsOptional()
  @IsString()
  body?: string;

  /** Variable values: { client_name: 'John', login_password: 'xxx', ... } */
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
