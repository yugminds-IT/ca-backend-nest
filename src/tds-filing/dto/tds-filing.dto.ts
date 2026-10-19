import { IsInt, IsString, IsIn, IsArray, IsOptional, IsPositive } from 'class-validator';

export class CreateTdsSessionDto {
  @IsInt()
  @IsPositive()
  clientId: number;
}

export class SetFormTypeDto {
  @IsString()
  @IsIn(['24Q', '26Q', '27Q', '27EQ'])
  formType: string;

  @IsString()
  @IsIn(['old', 'new'])
  formVersion: string;

  @IsString()
  @IsIn(['Q1', 'Q2', 'Q3', 'Q4'])
  quarter: string;

  @IsArray()
  @IsString({ each: true })
  selectedSections: string[];
}
