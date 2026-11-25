import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNumber,
  IsObject,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SegmentRulesDto } from '../../clients/segment-rules';

/** Send to everyone matching rules; who that is gets worked out when the email goes out. */
export class BulkSegmentDto extends SegmentRulesDto {
  /** Contacts unticked in the panel */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50000)
  @IsInt({ each: true })
  excludeIds?: number[];

  /** Sender's UTC offset in minutes (330 for India), so date rules use their calendar day */
  @IsInt()
  @Min(-720)
  @Max(840)
  tzOffsetMinutes: number;

  /** Values typed for this send: they fill a recipient's blanks and never replace their own values */
  @IsOptional()
  @IsObject()
  fallbacks?: Record<string, string>;

  /** Shown in Scheduled Mails, e.g. "VIP · Pune" */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}

/** A file uploaded with POST /mail-management/attachments */
export class AttachmentRefDto {
  @IsString()
  @Matches(/^mail-attachments\/[\w-]+\/[\w-]+\/[^/]+$/)
  key: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsInt()
  @Min(0)
  @Max(10 * 1024 * 1024)
  size: number;

  @IsString()
  @MaxLength(150)
  contentType: string;
}

export class BulkRecipientDto {
  @IsEmail()
  email: string;

  /** This recipient's own values, e.g. { client_name: 'Asha' } */
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  /** Files only this recipient gets (e.g. their own invoice) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => AttachmentRefDto)
  attachments?: AttachmentRefDto[];
}

/** Send one message to many recipients now. Queued and sent by the server, not the browser. */
export class SendBulkDto {
  @IsOptional()
  @IsNumber()
  templateId?: number;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  /** Explicit recipients; may be empty when sending to a `segment` */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => BulkRecipientDto)
  recipients: BulkRecipientDto[] = [];

  @IsOptional()
  @ValidateNested()
  @Type(() => BulkSegmentDto)
  segment?: BulkSegmentDto;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bcc?: string;

  /** Files every recipient gets */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentRefDto)
  attachments?: AttachmentRefDto[];
}
