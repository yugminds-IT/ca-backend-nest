import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class SmtpConfigDto {
  @IsString()
  smtpHost: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort: number;

  @IsBoolean()
  smtpSecure: boolean;

  @IsString()
  smtpUser: string;

  @IsString()
  smtpPass: string;

  @IsOptional()
  @IsString()
  smtpFrom?: string;
}

export class MailIdentityDto {
  /** Empty string clears it */
  @IsOptional()
  @ValidateIf((o: MailIdentityDto) => !!o.replyTo)
  @IsEmail({}, { message: 'Reply-to must be an email address' })
  replyTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signature?: string;
}

export class TestSmtpDto {
  @IsEmail()
  testEmail: string;
}
