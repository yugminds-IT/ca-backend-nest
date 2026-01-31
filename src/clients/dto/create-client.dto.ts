import { IsEmail, IsNotEmpty, IsOptional, IsString, IsInt, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClientDto {
  @IsInt()
  @Type(() => Number)
  @IsNotEmpty()
  organizationId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsInt()
  @Type(() => Number)
  @IsOptional()
  userId?: number;
}
