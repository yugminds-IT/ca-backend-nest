import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendTestMailDto {
  @IsEmail()
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;
}
