import { IsEmail, IsNotEmpty, IsOptional, IsString, IsInt, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class OrgAdminSignupDto {
  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  organizationId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;
}
