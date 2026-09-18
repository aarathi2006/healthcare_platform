import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  WorkflowExecution,
  WorkflowStatus,
} from './entities/workflow-execution.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Patient } from '../patients/entities/patient.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { QuestionnairesService } from '../questionnaires/questionnaires.service';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @InjectRepository(WorkflowExecution)
    private wfRepo: Repository<WorkflowExecution>,
    @InjectRepository(Appointment)
    private apptRepo: Repository<Appointment>,
    @InjectRepository(Doctor) private doctorRepo: Repository<Doctor>,
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
    private notifications: NotificationsService,
    private questionnaires: QuestionnairesService,
  ) {}

  async onAppointmentConfirmed(
    appointmentId: string,
  ): Promise<WorkflowExecution> {
    const correlationId = randomUUID();

    const wf = await this.wfRepo.save(
      this.wfRepo.create({
        workflowName: 'POST_BOOKING',
        correlationId,
        status: WorkflowStatus.RUNNING,
        state: { appointmentId, steps: [] },
        attempts: 1,
      }),
    );

    try {
      const appointment = await this.apptRepo.findOne({
        where: { id: appointmentId },
      });
      if (!appointment) throw new Error('Appointment not found');

      const doctor = await this.doctorRepo.findOne({
        where: { id: appointment.doctorId },
      });
      const patient = await this.patientRepo.findOne({
        where: { id: appointment.patientId },
      });

      const steps: any[] = [];

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
        steps.push({
          step: 'ASSIGN_QUESTIONNAIRE',
          questionnaireId: q.id,
          status: 'OK',
        });
      } else {
        steps.push({ step: 'ASSIGN_QUESTIONNAIRE', status: 'SKIPPED_NO_MATCH' });
      }

      if (patient) {
        await this.notifications.enqueue({
          recipientType: 'PATIENT',
          recipientId: patient.id,
          channel: 'EMAIL',
          title: 'Appointment Confirmed',
          body: `Your appointment with ${
            doctor?.name || 'your doctor'
          } is confirmed for ${appointment.startDatetime.toISOString()}. Please complete your pre-visit questionnaire.`,
        });
        steps.push({ step: 'NOTIFY_PATIENT', status: 'OK' });
      }

      if (doctor) {
        await this.notifications.enqueue({
          recipientType: 'DOCTOR',
          recipientId: doctor.id,
          channel: 'IN_APP',
          title: 'New Appointment',
          body: `New appointment booked: ${
            patient?.name || 'patient'
          } at ${appointment.startDatetime.toISOString()}.`,
        });
        steps.push({ step: 'NOTIFY_DOCTOR', status: 'OK' });
      }

      const reminderAt = new Date(
        appointment.startDatetime.getTime() - 24 * 60 * 60 * 1000,
      );
      steps.push({
        step: 'SCHEDULE_REMINDER',
        reminderAt: reminderAt.toISOString(),
        status: 'OK',
      });

      wf.state = { appointmentId, steps };
      wf.status = WorkflowStatus.COMPLETED;
      await this.wfRepo.save(wf);

      this.logger.log(
        `[${correlationId}] POST_BOOKING workflow completed with ${steps.length} steps`,
      );
      return wf;
    } catch (err: any) {
      wf.status = WorkflowStatus.FAILED;
      wf.state = { ...(wf.state || {}), error: err.message };
      await this.wfRepo.save(wf);
      this.logger.error(`[${correlationId}] Workflow failed: ${err.message}`);
      throw err;
    }
  }

  async listRecent(limit = 20) {
    return this.wfRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}

