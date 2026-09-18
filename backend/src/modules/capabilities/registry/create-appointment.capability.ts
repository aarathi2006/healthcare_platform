import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { SchedulingService } from '../../scheduling/scheduling.service';
import { IntegrationService } from '../../integration/integration.service';
import { WorkflowsService } from '../../workflows/workflows.service';
import { QuestionnairesService } from '../../questionnaires/questionnaires.service';
import { Appointment } from '../../appointments/entities/appointment.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { CapabilityDefinition } from '../capability.interface';

export interface CreateAppointmentInput {
  doctorId: string;
  patientId: string;
  startDatetime: string;
  appointmentType?: string;
}

@Injectable()
export class CreateAppointmentCapability {
  private logger = new Logger(CreateAppointmentCapability.name);

  constructor(
    private scheduling: SchedulingService,
    private integration: IntegrationService,
    private workflows: WorkflowsService,
    private questionnaires: QuestionnairesService,
    @InjectRepository(Appointment)
    private apptRepo: Repository<Appointment>,
    @InjectRepository(Doctor) private doctorRepo: Repository<Doctor>,
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
  ) {}

  get definition(): CapabilityDefinition<CreateAppointmentInput> {
    return {
      name: 'create_appointment',
      description:
        'Book an appointment for a patient with a specific doctor at a specific slot. Only call after check_availability and user confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          doctorId: { type: 'string' },
          patientId: { type: 'string' },
          startDatetime: { type: 'string' },
          appointmentType: { type: 'string', default: 'CONSULT' },
        },
        required: ['doctorId', 'patientId', 'startDatetime'],
      },
      requiresConfirmation: true,
      handler: async (input) => this.run(input),
    };
  }

  private async run(input: CreateAppointmentInput) {
    const doctor = await this.doctorRepo.findOne({
      where: { id: input.doctorId },
    });
    if (!doctor) return { error: 'Doctor not found' };

    const patient = await this.patientRepo.findOne({
      where: { id: input.patientId },
    });
    if (!patient) return { error: 'Patient not found' };

    const start = new Date(input.startDatetime);
    if (isNaN(start.getTime())) return { error: 'Invalid startDatetime' };
    const end = new Date(
      start.getTime() + doctor.appointmentDurationMinutes * 60000,
    );

    const correlationId = randomUUID();
    const idempotencyKey = `ai-${correlationId}`;

    // Reserve slot internally (pessimistic lock)
    let appointment: Appointment;
    try {
      appointment = await this.scheduling.reserveSlot({
        hospitalId: doctor.hospitalId,
        doctorId: doctor.id,
        patientId: patient.id,
        startDatetime: start,
        endDatetime: end,
        appointmentType: input.appointmentType || 'CONSULT',
        idempotencyKey,
        correlationId,
      });
    } catch (err: any) {
      return { error: err.message || 'Could not reserve slot' };
    }

    // Resolve external EHR IDs
    const externalPatientId = patient.externalPatientId;
    const externalProviderId = doctor.externalProviderId;

    if (!externalPatientId || !externalProviderId) {
      this.logger.warn(
        `Missing EHR mapping — patient=${externalPatientId} provider=${externalProviderId}. Booking left as PENDING.`,
      );
      return {
        status: 'PENDING',
        appointmentId: appointment.id,
        startDatetime: appointment.startDatetime,
        message:
          'Appointment reserved internally but EHR mapping is missing. Operator should link external IDs and retry integration.',
      };
    }

    // Book via EHR integration
    const result = await this.integration.createAppointmentViaEhr({
      appointment,
      externalPatientId,
      externalProviderId,
    });

    // On successful booking: assign questionnaire SYNCHRONOUSLY so the AI can
    // immediately ask questions in the same chat turn.
    if (
      result.status === 'CONFIRMED' ||
      result.status === 'RECONCILIATION_REQUIRED'
    ) {
      try {
        const q = await this.questionnaires.findFor(
          appointment.hospitalId,
          appointment.appointmentType,
        );
        if (q) {
          await this.questionnaires.assign(
            q.id,
            appointment.id,
            appointment.patientId,
          );
          this.logger.log(
            `Assigned questionnaire ${q.id} to appointment ${appointment.id}`,
          );
        } else {
          this.logger.warn(
            `No questionnaire matches hospital=${appointment.hospitalId} type=${appointment.appointmentType}`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Questionnaire assignment failed: ${err.message}`,
        );
      }

      // Fire the notification workflow asynchronously (doesn't block)
      this.workflows
        .onAppointmentConfirmed(appointment.id)
        .catch((err) =>
          this.logger.error(`Post-booking workflow failed: ${err.message}`),
        );
    }

    return {
      status: result.status,
      appointmentId: appointment.id,
      externalAppointmentId: result.externalAppointmentId,
      startDatetime: appointment.startDatetime,
      message: result.message,
    };
  }
}

