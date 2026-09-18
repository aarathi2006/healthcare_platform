import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from '../../appointments/entities/appointment.entity';
import { QuestionnairesService } from '../../questionnaires/questionnaires.service';
import { CapabilityDefinition } from '../capability.interface';

export interface GetQuestionnaireInput {
  appointmentId: string;
}

@Injectable()
export class GetQuestionnaireCapability {
  constructor(
    @InjectRepository(Appointment)
    private apptRepo: Repository<Appointment>,
    private questionnaires: QuestionnairesService,
  ) {}

  get definition(): CapabilityDefinition<GetQuestionnaireInput> {
    return {
      name: 'get_questionnaire',
      description:
        'Fetch the pre-visit questionnaire assigned to an appointment. Use when the patient wants to answer intake questions.',
      inputSchema: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string' },
        },
        required: ['appointmentId'],
      },
      requiresConfirmation: false,
      handler: async (input) => this.run(input),
    };
  }

  private async run(input: GetQuestionnaireInput) {
    const appointment = await this.apptRepo.findOne({
      where: { id: input.appointmentId },
    });
    if (!appointment) return { error: 'Appointment not found' };

    const data = await this.questionnaires.getQuestionnaireWithResponse(
      input.appointmentId,
    );
    if (!data) return { error: 'No questionnaire assigned' };

    return {
      questionnaire: {
        id: data.questionnaire?.id,
        name: data.questionnaire?.name,
        questions: data.questionnaire?.questions,
      },
      alreadySubmitted: data.response?.status === 'COMPLETED',
      existingResponses: data.response?.responses || {},
    };
  }
}

