import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EhrAppointment } from './entities/ehr-appointment.entity';
import { EhrAppointmentsService } from './appointments.service';
import { EhrAppointmentsController } from './appointments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EhrAppointment])],
  providers: [EhrAppointmentsService],
  controllers: [EhrAppointmentsController],
  exports: [EhrAppointmentsService],
})
export class EhrAppointmentsModule {}

