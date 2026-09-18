import { Injectable } from '@nestjs/common';
import { SchedulingService } from '../../scheduling/scheduling.service';
import { Doctor } from '../../doctors/entities/doctor.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CapabilityDefinition } from '../capability.interface';

export interface CheckAvailabilityInput {
  doctorId: string;
  fromDate: string;
  toDate: string;
}

@Injectable()
export class CheckAvailabilityCapability {
  constructor(
    private scheduling: SchedulingService,
    @InjectRepository(Doctor) private doctorRepo: Repository<Doctor>,
  ) {}

  get definition(): CapabilityDefinition<CheckAvailabilityInput> {
    return {
      name: 'check_availability',
      description:
        'Get real available appointment slots for a specific doctor between two dates. Returns ISO timestamps. ALWAYS call this before booking. Never invent slots.',
      inputSchema: {
        type: 'object',
        properties: {
          doctorId: { type: 'string' },
          fromDate: { type: 'string' },
          toDate: { type: 'string' },
        },
        required: ['doctorId', 'fromDate', 'toDate'],
      },
      requiresConfirmation: false,
      handler: async (input) => this.run(input),
    };
  }

  private async run(input: CheckAvailabilityInput) {
    const from = new Date(input.fromDate);
    const to = new Date(input.toDate);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return { error: 'Invalid date format' };
    }
    const doctor = await this.doctorRepo.findOne({
      where: { id: input.doctorId },
    });
    if (!doctor) return { error: 'Doctor not found' };

    const slots = await this.scheduling.getAvailableSlots(
      input.doctorId,
      from,
      to,
      doctor.appointmentDurationMinutes,
    );

    return {
      doctorId: input.doctorId,
      doctorName: doctor.name,
      total: slots.length,
      slots: slots.slice(0, 20).map((s) => s.toISOString()),
    };
  }
}

