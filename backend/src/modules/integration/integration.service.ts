import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  EhrOperationStatus,
  CreateAppointmentInput,
} from './connectors/ehr-connector.interface';
import type { EhrConnector } from './connectors/ehr-connector.interface';
import { MockEhrConnector } from './connectors/mock-ehr.connector';
import { IntegrationOperation, IntegrationStatus } from './entities/integration-operation.entity';
import { ReconciliationRecord, ReconciliationStatus } from './entities/reconciliation-record.entity';
import { ExternalIdMapping } from './entities/external-id-mapping.entity';
import { Appointment, AppointmentStatus } from '../appointments/entities/appointment.entity';
import { AuditEvent } from '../audit/entities/audit-event.entity';

export interface CreateAppointmentViaEhrInput {
  appointment: Appointment;
  externalPatientId: string;
  externalProviderId: string;
  externalFacilityId?: string | null;
}

export interface CreateAppointmentViaEhrResult {
  success: boolean;
  externalAppointmentId?: string;
  status: 'CONFIRMED' | 'RECONCILIATION_REQUIRED' | 'FAILED';
  message: string;
  correlationId: string;
}

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    @Inject('EHR_CONNECTOR')
    private readonly ehr: EhrConnector,
    @InjectRepository(IntegrationOperation)
    private readonly opRepo: Repository<IntegrationOperation>,
    @InjectRepository(ReconciliationRecord)
    private readonly reconcileRepo: Repository<ReconciliationRecord>,
    @InjectRepository(ExternalIdMapping)
    private readonly mappingRepo: Repository<ExternalIdMapping>,
    @InjectRepository(Appointment)
    private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
  ) {}

  /**
   * Main orchestration:
   *   1. Call EHR createAppointment
   *   2. If SUCCESS → verify by re-fetching the appointment
   *   3. If UNKNOWN → attempt recovery lookup, then verify
   *   4. If FAILED → mark as failed, no reconciliation needed
   *   5. Persist integration operation record for every attempt
   */
  async createAppointmentViaEhr(
    input: CreateAppointmentViaEhrInput,
    failureMode?: string,
  ): Promise<CreateAppointmentViaEhrResult> {
    const correlationId = input.appointment.correlationId;

    const ehrInput: CreateAppointmentInput = {
      externalPatientId: input.externalPatientId,
      externalProviderId: input.externalProviderId,
      externalFacilityId: input.externalFacilityId,
      startDatetime: input.appointment.startDatetime,
      endDatetime: input.appointment.endDatetime,
      idempotencyKey: input.appointment.idempotencyKey,
    };

    // 1. Attempt creation
    const op = await this.opRepo.save(
      this.opRepo.create({
        correlationId,
        operationType: 'CREATE_APPOINTMENT',
        requestPayload: this.scrub(ehrInput),
        status: IntegrationStatus.STARTED,
      }),
    );
    const result = await this.ehr.createAppointment(ehrInput, failureMode);

    await this.recordOperationOutcome(op.id, result);

    // 2. Definitively failed (4xx) → no reconciliation needed
    if (result.status === EhrOperationStatus.FAILED) {
      await this.markAppointmentFailed(input.appointment.id, result.errorMessage);
      await this.audit('EHR_CREATE_FAILED', input.appointment.id, {
        correlationId,
        errorMessage: result.errorMessage,
        errorCode: result.errorCode,
      });
      return {
        success: false,
        status: 'FAILED',
        message: `EHR rejected the appointment: ${result.errorMessage}`,
        correlationId,
      };
    }

    // 3. SUCCESS — but we must still verify
    if (result.status === EhrOperationStatus.SUCCESS && result.data) {
      const verified = await this.verifyAppointment(result.data.id);
      if (verified) {
        await this.syncInternalState(input.appointment.id, result.data.id, correlationId);
        return {
          success: true,
          externalAppointmentId: result.data.id,
          status: 'CONFIRMED',
          message: 'Appointment created and verified in EHR',
          correlationId,
        };
      }
      // Success response but could not verify — treat as unknown
    }

    // 4. UNKNOWN — query EHR to figure out what happened
    return this.recoverUnknownOutcome(input, correlationId, op.id);
  }

  /**
   * After UNKNOWN, look for the appointment by idempotency key.
   * If found → the operation actually succeeded, verify and sync.
   * If not found → safe to retry once.
   * If still unknown → reconciliation.
   */
  private async recoverUnknownOutcome(
    input: CreateAppointmentViaEhrInput,
    correlationId: string,
    operationId: string,
  ): Promise<CreateAppointmentViaEhrResult> {
    this.logger.warn(`[${correlationId}] Unknown outcome — starting recovery`);

    const lookup = await this.ehr.findByCriteria({
      providerId: input.externalProviderId,
      idempotencyKey: input.appointment.idempotencyKey,
      startDatetime: input.appointment.startDatetime,
    });

    // 4a. Found → the original request actually succeeded
    if (
      lookup.status === EhrOperationStatus.SUCCESS &&
      lookup.data &&
      lookup.data.length > 0
    ) {
      const found = lookup.data[0];
      this.logger.log(
        `[${correlationId}] Recovery: appointment found in EHR (${found.id})`,
      );

      await this.opRepo.update(operationId, {
        status: IntegrationStatus.RECONCILED,
        responsePayload: { recovered: true, externalId: found.id } as any,
      });

      await this.syncInternalState(input.appointment.id, found.id, correlationId);
      return {
        success: true,
        externalAppointmentId: found.id,
        status: 'CONFIRMED',
        message: 'Recovered from unknown outcome: appointment confirmed in EHR',
        correlationId,
      };
    }

    // 4b. Not found → safe to attempt a single retry
    if (lookup.status === EhrOperationStatus.SUCCESS) {
      this.logger.warn(
        `[${correlationId}] Recovery: no appointment found — safe to retry once`,
      );

      const retry = await this.ehr.createAppointment({
        externalPatientId: input.externalPatientId,
        externalProviderId: input.externalProviderId,
        externalFacilityId: input.externalFacilityId,
        startDatetime: input.appointment.startDatetime,
        endDatetime: input.appointment.endDatetime,
        idempotencyKey: input.appointment.idempotencyKey,
      });

      if (retry.status === EhrOperationStatus.SUCCESS && retry.data) {
        await this.syncInternalState(
          input.appointment.id,
          retry.data.id,
          correlationId,
        );
        await this.opRepo.update(operationId, {
          status: IntegrationStatus.SUCCESS,
          retryCount: 1,
          responsePayload: { retried: true, externalId: retry.data.id } as any,
        });
        return {
          success: true,
          externalAppointmentId: retry.data.id,
          status: 'CONFIRMED',
          message: 'Retry succeeded after unknown outcome',
          correlationId,
        };
      }
    }

    // 4c. Cannot determine — escalate to reconciliation
    this.logger.error(
      `[${correlationId}] Reconciliation required: could not determine EHR state`,
    );

    await this.markAppointmentReconciliation(input.appointment.id);
    await this.reconcileRepo.save(
      this.reconcileRepo.create({
        correlationId,
        appointmentId: input.appointment.id,
        reason:
          'Unknown outcome after EHR call and recovery query — operator must verify external state',
        status: ReconciliationStatus.OPEN,
      }),
    );
    await this.opRepo.update(operationId, {
      status: IntegrationStatus.UNKNOWN,
    });
    await this.audit('RECONCILIATION_REQUIRED', input.appointment.id, {
      correlationId,
    });

    return {
      success: false,
      status: 'RECONCILIATION_REQUIRED',
      message:
        'Could not determine external state — reconciliation record created, operator intervention required',
      correlationId,
    };
  }

  /**
   * Query the EHR to verify a claimed appointment exists.
   */
  private async verifyAppointment(
    externalId: string,
  ): Promise<boolean> {
    const result = await this.ehr.getAppointmentById(externalId);
    return (
      result.status === EhrOperationStatus.SUCCESS &&
      !!result.data &&
      result.data.id === externalId
    );
  }

  /**
   * Update internal appointment status and store external mapping.
   */
  private async syncInternalState(
    appointmentId: string,
    externalId: string,
    correlationId: string,
  ) {
    await this.apptRepo.update(appointmentId, {
      status: AppointmentStatus.CONFIRMED,
      externalAppointmentId: externalId,
    });

    await this.mappingRepo.save(
      this.mappingRepo.create({
        internalEntityType: 'APPOINTMENT',
        internalId: appointmentId,
        externalSystem: 'MOCK_EHR',
        externalId,
      }),
    );

    await this.audit('APPOINTMENT_SYNCED', appointmentId, {
      correlationId,
      externalId,
    });
  }

  private async markAppointmentFailed(appointmentId: string, reason?: string) {
    await this.apptRepo.update(appointmentId, {
      status: AppointmentStatus.FAILED,
    });
  }

  private async markAppointmentReconciliation(appointmentId: string) {
    await this.apptRepo.update(appointmentId, {
      status: AppointmentStatus.RECONCILIATION_REQUIRED,
    });
  }

  private async recordOperationOutcome(
    opId: string,
    result: { status: EhrOperationStatus; data?: any; errorMessage?: string },
  ) {
    const map: Record<EhrOperationStatus, IntegrationStatus> = {
      [EhrOperationStatus.SUCCESS]: IntegrationStatus.SUCCESS,
      [EhrOperationStatus.FAILED]: IntegrationStatus.FAILED,
      [EhrOperationStatus.UNKNOWN]: IntegrationStatus.UNKNOWN,
    };
    await this.opRepo.update(opId, {
      status: map[result.status],
      responsePayload: (result.data ? { externalId: result.data.id } : undefined) as any,
      errorMessage: result.errorMessage || null,
    });

  }

  private async audit(
    action: string,
    entityId: string | null,
    metadata: any,
  ) {
    await this.auditRepo.save(
      this.auditRepo.create({
        actorType: 'SYSTEM',
        actorId: null,
        action,
        entityType: 'APPOINTMENT',
        entityId,
        metadata,
        correlationId: metadata?.correlationId || null,
      }),
    );
  }

  private scrub(obj: any): any {
    // Remove PII-like fields from logs. Here we keep only what's needed.
    if (!obj) return obj;
    const { externalPatientId, ...rest } = obj;
    return rest;
  }
}

