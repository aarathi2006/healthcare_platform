import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from '../../appointments/entities/appointment.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';
import { CapabilityDefinition } from '../capability.interface';

export interface GetAppointmentInput {
  appointmentId?: string;
  patientId?: string;
}

@Injectable()
export class GetAppointmentCapability {
  constructor(
    @InjectRepository(Appointment)
    private apptRepo: Repository<Appointment>,
    @InjectRepository(Doctor) private doctorRepo: Repository<Doctor>,
  ) {}

  get definition(): CapabilityDefinition<GetAppointmentInput> {
    return {
      name: 'get_appointment',
      description: 'Look up an appointment by ID or list all for a patient.',
      inputSchema: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string' },
          patientId: { type: 'string' },
        },
      },
      requiresConfirmation: false,
      handler: async (input) => this.run(input),
    };
  }

  private async run(input: GetAppointmentInput) {
    if (input.appointmentId) {
      const a = await this.apptRepo.findOne({
        where: { id: input.appointmentId },
      });
      if (!a) return { error: 'Appointment not found' };
      const doctor = await this.doctorRepo.findOne({
        where: { id: a.doctorId },
      });
      return {
        appointment: {
          id: a.id,
          status: a.status,
          startDatetime: a.startDatetime,
          endDatetime: a.endDatetime,
          appointmentType: a.appointmentType,
          doctorName: doctor?.name,
          externalAppointmentId: a.externalAppointmentId,
        },
      };
    }

    if (input.patientId) {
      const all = await this.apptRepo.find({
        where: { patientId: input.patientId },
        order: { startDatetime: 'DESC' },
        take: 20,
      });
      return {
        appointments: all.map((a) => ({
          id: a.id,
          status: a.status,
          startDatetime: a.startDatetime,
          endDatetime: a.endDatetime,
        })),
      };
    }

    return { error: 'Provide appointmentId or patientId' };
  }
}

