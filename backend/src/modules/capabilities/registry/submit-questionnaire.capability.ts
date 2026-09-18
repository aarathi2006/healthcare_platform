import { Injectable } from '@nestjs/common';
import { QuestionnairesService } from '../../questionnaires/questionnaires.service';
import { CapabilityDefinition } from '../capability.interface';

export interface SubmitQuestionnaireInput {
  appointmentId: string;
  responses: Record<string, any>;
}

@Injectable()
export class SubmitQuestionnaireCapability {
  constructor(private questionnaires: QuestionnairesService) {}

  get definition(): CapabilityDefinition<SubmitQuestionnaireInput> {
    return {
      name: 'submit_questionnaire',
      description:
        'Submit structured responses for the pre-visit questionnaire. Only call after asking all required questions.',
      inputSchema: {
        type: 'object',
        properties: {
          appointmentId: { type: 'string' },
          responses: {
            type: 'object',
            description:
              'Key-value map of questionId -> answer (string, number, or boolean)',
          },
        },
        required: ['appointmentId', 'responses'],
      },
      requiresConfirmation: false,
      handler: async (input) => this.run(input),
    };
  }

  private async run(input: SubmitQuestionnaireInput) {
    try {
      const result = await this.questionnaires.submitResponses(
        input.appointmentId,
        input.responses,
      );
      return {
        status: 'SUBMITTED',
        responseId: result.id,
        message: 'Responses recorded.',
      };
    } catch (err: any) {
      return { error: err.message };
    }
  }
}

