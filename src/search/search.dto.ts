import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GlobalSearchQuery {
  @IsString()
  @MaxLength(100)
  q: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizationId?: number;

  /** Omit for all units the caller can see. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  businessUnitId?: number;

  /** Results per group, 1 to 10. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  limit?: number;
}

export interface SearchHit {
  id: number;
  label: string;
  sublabel: string | null;
  businessUnitId: number | null;
  href: string;
}

export interface GlobalSearchResult {
  query: string;
  leads: SearchHit[];
  tasks: SearchHit[];
  clients: SearchHit[];
  contacts: SearchHit[];
}
