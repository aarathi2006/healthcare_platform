import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { Calendar } from '../calendars/entities/calendar.entity';
import { WorkingHours } from './entities/working-hours.entity';
import { BlockedSlot } from './entities/blocked-slot.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { Doctor } from '../doctors/entities/doctor.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Calendar,
      WorkingHours,
      BlockedSlot,
      Appointment,
      Doctor,
    ]),
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}

