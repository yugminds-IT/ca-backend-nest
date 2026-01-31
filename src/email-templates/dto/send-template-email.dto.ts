import { IsEmail, IsNumber, IsOptional, IsObject, IsString } from 'class-validator';

/** Variable key without braces, e.g. client_name. Values are strings. */
export class SendTemplateEmailDto {
  @IsEmail()
  to: string;

  @IsNumber()
  templateId: number;

  /** Variable values: { client_name: 'John', login_password: 'xxx', ... } */
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
