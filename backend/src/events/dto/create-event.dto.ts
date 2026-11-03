import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @Length(3, 120)
  title!: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsString()
  @Length(1, 120)
  venue!: string;

  @IsString()
  @Length(1, 120)
  city!: string;

  @IsISO8601()
  startsAt!: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents!: number;

  @IsInt()
  @Min(1)
  @Max(100_000)
  capacity!: number;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string | null;
}
