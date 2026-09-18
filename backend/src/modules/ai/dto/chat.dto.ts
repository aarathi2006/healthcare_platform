import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;
}

