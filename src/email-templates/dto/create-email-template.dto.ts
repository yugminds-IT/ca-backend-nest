import { IsString, IsOptional, IsIn, IsNumber, MaxLength, MinLength } from 'class-validator';
import { TemplateCategory } from '../constants/template-category.enum';
import { TEMPLATE_TYPES_BY_CATEGORY } from '../constants/template-type.enum';

const CATEGORIES = Object.values(TemplateCategory);

function getTypesForCategory(category: string): string[] {
  const types = (TEMPLATE_TYPES_BY_CATEGORY as Record<string, Record<string, string>>)[category];
  return types ? Object.keys(types) : [];
}

export class CreateEmailTemplateDto {
  @IsString()
  @IsIn(CATEGORIES, { message: 'category must be one of: service, login, notification, follow_up, reminder' })
  category: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject: string;

  @IsString()
  @MinLength(1)
  body: string;

  /** Only master admin can set; org users create for their own org */
  @IsOptional()
  @IsNumber()
  organizationId?: number | null;
}

export function validateTemplateType(category: string, type: string): boolean {
  const validTypes = getTypesForCategory(category);
  return validTypes.length === 0 || validTypes.includes(type);
}
