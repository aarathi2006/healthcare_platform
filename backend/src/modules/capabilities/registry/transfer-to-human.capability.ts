import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from '../../audit/entities/audit-event.entity';
import { CapabilityDefinition } from '../capability.interface';

export interface TransferToHumanInput {
  reason: string;
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
  patientId?: string;
}

@Injectable()
export class TransferToHumanCapability {
  constructor(
    @InjectRepository(AuditEvent)
    private auditRepo: Repository<AuditEvent>,
  ) {}

  get definition(): CapabilityDefinition<TransferToHumanInput> {
    return {
      name: 'transfer_to_human',
      description:
        'Escalate to human. Use for: medical emergency, out-of-scope request, user explicitly asks, or AI cannot proceed.',
      inputSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          urgency: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH'],
            default: 'MEDIUM',
          },
          patientId: { type: 'string' },
        },
        required: ['reason'],
      },
      requiresConfirmation: false,
      handler: async (input) => this.run(input),
    };
  }

  private async run(input: TransferToHumanInput) {
    await this.auditRepo.save(
      this.auditRepo.create({
        actorType: 'AI',
        actorId: null,
        action: 'TRANSFER_TO_HUMAN',
        entityType: 'CONVERSATION',
        entityId: null,
        metadata: {
          reason: input.reason,
          urgency: input.urgency || 'MEDIUM',
          patientId: input.patientId,
        },
        correlationId: null,
      }),
    );

    return {
      escalated: true,
      urgency: input.urgency || 'MEDIUM',
      message: `Escalated to human. Reason: ${input.reason}`,
    };
  }
}


