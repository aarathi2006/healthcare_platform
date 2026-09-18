import { IsUUID, IsDateString, IsString, MinLength } from 'class-validator';

export class ReserveSlotDto {
  @IsUUID()
  hospitalId: string;

  @IsUUID()
  doctorId: string;

  @IsUUID()
  patientId: string;

  @IsDateString()
  startDatetime: string;

  @IsDateString()
  endDatetime: string;

  @IsString()
  @MinLength(1)
  appointmentType: string;

  @IsString()
  @MinLength(8)
  idempotencyKey: string;
}

