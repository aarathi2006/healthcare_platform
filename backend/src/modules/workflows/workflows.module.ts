import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowExecution } from './entities/workflow-execution.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Patient } from '../patients/entities/patient.entity';
import { WorkflowsService } from './workflows.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuestionnairesModule } from '../questionnaires/questionnaires.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowExecution,
      Appointment,
      Doctor,
      Patient,
    ]),
    NotificationsModule,
    QuestionnairesModule,
  ],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}


