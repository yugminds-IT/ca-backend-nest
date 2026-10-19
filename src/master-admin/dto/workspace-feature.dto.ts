import { IsString, IsOptional, IsBoolean, IsInt, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateWorkspaceFeatureDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  badge?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  gradient?: string;

  @IsOptional()
  @IsString()
  colSpan?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @IsOptional()
  @IsString()
  lockReason?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderItemDto {
  @IsString()
  key: string;

  @IsInt()
  priority: number;
}

export class ReorderWorkspaceFeaturesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}
