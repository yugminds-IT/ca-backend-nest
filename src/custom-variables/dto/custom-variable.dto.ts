import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCustomVariableDto {
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{1,59}$/, {
    message: 'key must start with a letter and use only letters, numbers and _ (e.g. meeting_link)',
  })
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultValue?: string;
}

export class UpdateCustomVariableDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultValue?: string;
}

export class SetClientValuesDto {
  /** { meeting_link: "https://…" }; "" clears a value */
  @IsObject()
  values: Record<string, string>;
}
