import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Questionnaire } from './entities/questionnaire.entity';
import {
  QuestionnaireResponse,
  ResponseStatus,
} from './entities/questionnaire-response.entity';

@Injectable()
export class QuestionnairesService {
  private readonly logger = new Logger(QuestionnairesService.name);

  constructor(
    @InjectRepository(Questionnaire)
    private qRepo: Repository<Questionnaire>,
    @InjectRepository(QuestionnaireResponse)
    private rRepo: Repository<QuestionnaireResponse>,
  ) {}

  async findFor(
    hospitalId: string,
    appointmentType: string,
  ): Promise<Questionnaire | null> {
    const candidates = await this.qRepo.find({ where: { hospitalId } });
    const exact = candidates.find(
      (q) =>
        q.assignedTo === `APPOINTMENT_TYPE:${appointmentType}` ||
        q.assignedTo === appointmentType,
    );
    return exact || candidates[0] || null;
  }

  async assign(
    questionnaireId: string,
    appointmentId: string,
    patientId: string,
  ): Promise<QuestionnaireResponse> {
    const existing = await this.rRepo.findOne({
      where: { appointmentId, questionnaireId },
    });
    if (existing) return existing;

    return this.rRepo.save(
      this.rRepo.create({
        questionnaireId,
        appointmentId,
        patientId,
        responses: {},
        status: ResponseStatus.PENDING,
      }),
    );
  }

  async findResponse(
    appointmentId: string,
  ): Promise<QuestionnaireResponse | null> {
    return this.rRepo.findOne({ where: { appointmentId } });
  }

  async submitResponses(
    appointmentId: string,
    responses: Record<string, any>,
  ): Promise<QuestionnaireResponse> {
    const existing = await this.rRepo.findOne({
      where: { appointmentId },
    });
    if (!existing) {
      throw new Error('No questionnaire assigned to this appointment');
    }
    existing.responses = { ...(existing.responses || {}), ...responses };
    existing.status = ResponseStatus.COMPLETED;
    return this.rRepo.save(existing);
  }

  async getQuestionnaireWithResponse(appointmentId: string) {
    const response = await this.rRepo.findOne({
      where: { appointmentId },
    });
    if (!response) return null;
    const questionnaire = await this.qRepo.findOne({
      where: { id: response.questionnaireId },
    });
    return { questionnaire, response };
  }
}

