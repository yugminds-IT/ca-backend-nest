import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class StageTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsInt()
  @Min(0)
  @Max(100)
  probability: number;

  @IsOptional()
  @IsBoolean()
  isWon?: boolean;

  @IsOptional()
  @IsBoolean()
  isLost?: boolean;
}

export class UpdateIndustryTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => StageTemplateDto)
  pipelineStages?: StageTemplateDto[];
}

export class ApplyPipelineTemplateDto {
  @IsString()
  @MinLength(1)
  key: string;

  @IsInt()
  @Type(() => Number)
  businessUnitId: number;

  /** Optional name for the new pipeline. Defaults to the template name. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
