import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  MaxLength,
  MinLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

const EMPLOYEE_ROLES = ['ORG_ADMIN', 'CAA', 'ORG_EMPLOYEE'] as const;

export class CreateEmployeeDto {
  @IsInt()
  @Type(() => Number)
  @IsOptional()
  organizationId?: number;

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

  @IsString()
  @IsNotEmpty()
  @IsIn(EMPLOYEE_ROLES, { message: 'roleName must be one of: ORG_ADMIN, CAA, ORG_EMPLOYEE' })
  roleName: (typeof EMPLOYEE_ROLES)[number];
}
