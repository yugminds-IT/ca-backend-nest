import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WORKFLOW_TRIGGERS } from './rules';

export class AssignmentRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsIn(['round_robin', 'load_balanced', 'by_field'])
  strategy: 'round_robin' | 'load_balanced' | 'by_field';

  @IsInt()
  businessUnitId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  memberUserIds?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  conditionField?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  conditionValue?: string | null;

  @IsOptional()
  @IsInt()
  targetUserId?: number | null;
}

export class WorkflowRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsIn(WORKFLOW_TRIGGERS)
  trigger: (typeof WORKFLOW_TRIGGERS)[number];

  /** Null or missing means every business unit. */
  @IsOptional()
  @IsInt()
  businessUnitId?: number | null;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  conditions?: Array<{ field: string; op: string; value?: string | number | null }>;

  @IsArray()
  actions: Array<Record<string, unknown> & { type: string }>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class SequenceStepDto {
  @IsIn(['email', 'task'])
  kind: 'email' | 'task';

  @IsInt()
  delayDays: number;

  @IsOptional()
  @IsInt()
  templateId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  taskTitle?: string | null;
}

export class SequenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsInt()
  businessUnitId: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  stopOnStageChange?: boolean;

  @IsOptional()
  @IsBoolean()
  stopOnReply?: boolean;

  @IsArray()
  steps: Array<Record<string, unknown> & { kind: string; delayDays: number }>;
}

export class EnrollDto {
  @IsInt()
  sequenceId: number;
}

export class SlaPolicyDto {
  @IsInt()
  businessUnitId: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsInt()
  @Min(1)
  @Max(10080)
  firstResponseMinutes: number;

  @IsOptional()
  @IsInt()
  escalateToUserId?: number | null;
}

export class ScoringRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsInt()
  businessUnitId: number;

  @IsString()
  @MaxLength(60)
  field: string;

  @IsIn(['exists', 'equals', 'contains', 'gte'])
  op: 'exists' | 'equals' | 'contains' | 'gte';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  value?: string | null;

  @IsInt()
  @Min(-100)
  @Max(100)
  points: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** Email to one lead from the CRM. Either a template or a subject and body. */
export class LeadEmailDto {
  @IsOptional()
  @IsInt()
  templateId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;
}
