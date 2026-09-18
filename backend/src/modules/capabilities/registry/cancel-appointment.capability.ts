import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../appointments/entities/appointment.entity';
import { AuditEvent } from '../../audit/entities/audit-event.entity';
import { CapabilityDefinition } from '../capability.interface';

export interface CancelAppointmentInput {
  appointmentId: string;
  reason?: string;
}

@Injectable()
export class CancelAppointmentCapability {
  constructor(
    @InjectRepository(Appointment)
    private apptRepo: Repository<Appointment>,
    @InjectRepository(AuditEvent)
    private auditRepo: Repository<AuditEvent>,
  ) {}

  get definition(): CapabilityDefinition<CancelAppointmentInput> {
    return {
      name: 'cancel_appointment',
      description: 'Cancel an existing appointment.',
      inputSchema: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['appointmentId'],
      },
      requiresConfirmation: true,
      handler: async (input) => this.run(input),
    };
  }

  private async run(input: CancelAppointmentInput) {
    const a = await this.apptRepo.findOne({
      where: { id: input.appointmentId },
    });
    if (!a) return { error: 'Appointment not found' };

    if (a.status === AppointmentStatus.CANCELLED) {
      return { error: 'Appointment is already cancelled' };
    }

    a.status = AppointmentStatus.CANCELLED;
    await this.apptRepo.save(a);

    await this.auditRepo.save(
      this.auditRepo.create({
        actorType: 'AI',
        actorId: null,
        action: 'CANCEL_APPOINTMENT',
        entityType: 'APPOINTMENT',
        entityId: a.id,
        metadata: { reason: input.reason || null },
        correlationId: a.correlationId,
      }),
    );

    return {
      status: 'CANCELLED',
      appointmentId: a.id,
      message: 'Appointment cancelled.',
    };
  }
}

