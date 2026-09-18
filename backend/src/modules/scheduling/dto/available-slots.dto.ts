import { IsUUID, IsDateString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class AvailableSlotsDto {
  @IsUUID()
  doctorId: string;

  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  durationMinutes?: number;
}

