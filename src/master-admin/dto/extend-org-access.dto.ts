import { IsISO8601 } from 'class-validator';

/** Body for PATCH .../organizations/:id/access — accepts any ISO 8601 date string from the client. */
export class ExtendOrgAccessDto {
  @IsISO8601(
    { strict: false, strictSeparator: false },
    { message: 'accessUntil must be a valid ISO 8601 date string' },
  )
  accessUntil: string;
}
