import { IsEmail, IsNotEmpty, IsOptional, IsString, IsInt, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsString()
  @IsNotEmpty()
  roleName: string;

  @IsInt()
  @Type(() => Number)
  @IsOptional()
  organizationId?: number;
}
