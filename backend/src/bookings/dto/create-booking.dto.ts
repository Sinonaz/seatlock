import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  eventId: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;
}
