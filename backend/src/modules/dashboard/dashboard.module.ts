import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Appointment } from '../appointments/entities/appointment.entity';
import { IntegrationOperation } from '../integration/entities/integration-operation.entity';
import { ReconciliationRecord } from '../integration/entities/reconciliation-record.entity';
import { WorkflowExecution } from '../workflows/entities/workflow-execution.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { CapabilityExecution } from '../capabilities/entities/capability-execution.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { Hospital } from '../hospitals/entities/hospital.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Questionnaire } from '../questionnaires/entities/questionnaire.entity';
import { QuestionnaireResponse } from '../questionnaires/entities/questionnaire-response.entity';
import { Calendar } from '../calendars/entities/calendar.entity';
import { WorkingHours } from '../scheduling/entities/working-hours.entity';
import { BlockedSlot } from '../scheduling/entities/blocked-slot.entity';
import { Department } from '../departments/entities/department.entity';
import { Specialty } from '../specialties/entities/specialty.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      IntegrationOperation,
      ReconciliationRecord,
      WorkflowExecution,
      Notification,
      AuditEvent,
      CapabilityExecution,
      Conversation,
      Hospital,
      Doctor,
      Patient,
      Questionnaire,
      QuestionnaireResponse,
      Calendar,
      WorkingHours,
      BlockedSlot,
      Department,
      Specialty,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}

