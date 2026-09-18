import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapabilityExecution } from './entities/capability-execution.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Hospital } from '../hospitals/entities/hospital.entity';
import { Specialty } from '../specialties/entities/specialty.entity';
import { Department } from '../departments/entities/department.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { Patient } from '../patients/entities/patient.entity';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { IntegrationModule } from '../integration/integration.module';
import { QuestionnairesModule } from '../questionnaires/questionnaires.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { CapabilityRegistryService } from './capability-registry.service';
import { SearchDoctorsCapability } from './registry/search-doctors.capability';
import { CheckAvailabilityCapability } from './registry/check-availability.capability';
import { CreateAppointmentCapability } from './registry/create-appointment.capability';
import { GetAppointmentCapability } from './registry/get-appointment.capability';
import { CancelAppointmentCapability } from './registry/cancel-appointment.capability';
import { TransferToHumanCapability } from './registry/transfer-to-human.capability';
import { GetQuestionnaireCapability } from './registry/get-questionnaire.capability';
import { SubmitQuestionnaireCapability } from './registry/submit-questionnaire.capability';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CapabilityExecution,
      Doctor,
      Hospital,
      Specialty,
      Department,
      Appointment,
      Patient,
      AuditEvent,
    ]),
    SchedulingModule,
    IntegrationModule,
    QuestionnairesModule,
    WorkflowsModule,
  ],
  providers: [
    CapabilityRegistryService,
    SearchDoctorsCapability,
    CheckAvailabilityCapability,
    CreateAppointmentCapability,
    GetAppointmentCapability,
    CancelAppointmentCapability,
    TransferToHumanCapability,
    GetQuestionnaireCapability,
    SubmitQuestionnaireCapability,
  ],
  exports: [CapabilityRegistryService],
})
export class CapabilitiesModule {}


