import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CapabilityDefinition, CapabilityContext } from './capability.interface';
import { CapabilityExecution } from './entities/capability-execution.entity';
import { SearchDoctorsCapability } from './registry/search-doctors.capability';
import { CheckAvailabilityCapability } from './registry/check-availability.capability';
import { CreateAppointmentCapability } from './registry/create-appointment.capability';
import { GetAppointmentCapability } from './registry/get-appointment.capability';
import { CancelAppointmentCapability } from './registry/cancel-appointment.capability';
import { TransferToHumanCapability } from './registry/transfer-to-human.capability';
import { GetQuestionnaireCapability } from './registry/get-questionnaire.capability';
import { SubmitQuestionnaireCapability } from './registry/submit-questionnaire.capability';

@Injectable()
export class CapabilityRegistryService {
  private readonly logger = new Logger(CapabilityRegistryService.name);
  private capabilities: Map<string, CapabilityDefinition> = new Map();

  constructor(
    private searchDoctors: SearchDoctorsCapability,
    private checkAvailability: CheckAvailabilityCapability,
    private createAppointment: CreateAppointmentCapability,
    private getAppointment: GetAppointmentCapability,
    private cancelAppointment: CancelAppointmentCapability,
    private transferToHuman: TransferToHumanCapability,
    private getQuestionnaire: GetQuestionnaireCapability,
    private submitQuestionnaire: SubmitQuestionnaireCapability,
    @InjectRepository(CapabilityExecution)
    private executionRepo: Repository<CapabilityExecution>,
  ) {
    [
      this.searchDoctors.definition,
      this.checkAvailability.definition,
      this.createAppointment.definition,
      this.getAppointment.definition,
      this.cancelAppointment.definition,
      this.transferToHuman.definition,
      this.getQuestionnaire.definition,
      this.submitQuestionnaire.definition,
    ].forEach((c) => this.capabilities.set(c.name, c));
  }

  listForAI() {
    return Array.from(this.capabilities.values()).map((c) => ({
      name: c.name,
      description: c.description,
      inputSchema: c.inputSchema,
      requiresConfirmation: c.requiresConfirmation,
    }));
  }

  async execute(name: string, input: any, ctx: CapabilityContext): Promise<any> {
    const cap = this.capabilities.get(name);
    if (!cap) {
      return { success: false, error: `Unknown capability: ${name}` };
    }

    const start = Date.now();
    try {
      const data = await cap.handler(input, ctx);
      const duration = Date.now() - start;

      await this.executionRepo.save(
        this.executionRepo.create({
          correlationId: ctx.correlationId,
          capabilityName: name,
          input: this.scrub(input),
          output: this.scrub(data),
          status: data?.error ? 'FAILED' : 'SUCCESS',
          error: data?.error || null,
          durationMs: duration,
        }),
      );

      return { success: !data?.error, data };
    } catch (err: any) {
      const duration = Date.now() - start;
      await this.executionRepo.save(
        this.executionRepo.create({
          correlationId: ctx.correlationId,
          capabilityName: name,
          input: this.scrub(input),
          output: null,
          status: 'FAILED',
          error: err.message || 'Unknown error',
          durationMs: duration,
        }),
      );
      return { success: false, error: err.message };
    }
  }

  private scrub(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const copy = { ...obj };
    if (copy.patientId) copy.patientId = '***';
    if (copy.externalPatientId) copy.externalPatientId = '***';
    return copy;
  }
}

