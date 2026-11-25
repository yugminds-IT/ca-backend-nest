import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_TAG_LENGTH, MAX_TAGS } from '../tags';

export class BulkTagDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @IsInt({ each: true })
  clientIds: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  add?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(MAX_TAG_LENGTH, { each: true })
  remove?: string[];
}
