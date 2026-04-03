import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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

export class TestSmtpDto {
  @IsEmail()
  testEmail: string;
}
