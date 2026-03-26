import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;
}
