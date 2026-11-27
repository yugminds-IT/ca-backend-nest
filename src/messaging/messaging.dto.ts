import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { MessageChannel } from './messaging.rules';

export class SendMessageDto {
  @IsIn(['sms', 'whatsapp'])
  channel: MessageChannel;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}
