import { IsInt, IsPositive } from 'class-validator';

export class CreateGstSessionDto {
  @IsInt()
  @IsPositive()
  clientId: number;
}
