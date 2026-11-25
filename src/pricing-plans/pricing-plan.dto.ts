import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Used for both create and update; create additionally requires the fields checked in the service. */
export class PricingPlanDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  price?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  period?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  badge?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  trialText?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  buttonText?: string;

  // Site path or http(s) URL only: blocks javascript: links on the public page.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^(\/(?!\/)|https?:\/\/)/, {
    message: 'buttonLink must start with / or http(s)://',
  })
  buttonLink?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  features?: string[];

  @IsOptional()
  @IsBoolean()
  isHighlighted?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
