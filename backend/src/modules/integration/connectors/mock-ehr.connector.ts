import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  CreateAppointmentInput,
  EhrOperationResult,
  EhrOperationStatus,
  ExternalAppointment,
} from './ehr-connector.interface';
import type { EhrConnector } from './ehr-connector.interface';

@Injectable()
export class MockEhrConnector implements EhrConnector {
  private readonly logger = new Logger(MockEhrConnector.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs = 8000;

  constructor(
    private http: HttpService,
    private config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>('EHR_BASE_URL')!;
    this.apiKey = this.config.get<string>('EHR_API_KEY')!;
  }

  async createAppointment(
    input: CreateAppointmentInput,
    failureMode?: string,
  ): Promise<EhrOperationResult<ExternalAppointment>> {
    try {
      const res = await firstValueFrom(
        this.http.post<ExternalAppointment>(
          `${this.baseUrl}/ehr/appointments`,
          {
            patientId: input.externalPatientId,
            providerId: input.externalProviderId,
            facilityId: input.externalFacilityId,
            startDatetime: input.startDatetime.toISOString(),
            endDatetime: input.endDatetime.toISOString(),
            idempotencyKey: input.idempotencyKey,
          },
          {
            headers: {
              'x-api-key': this.apiKey,
              ...(failureMode ? { 'x-simulate': failureMode } : {}),
            },
            timeout: this.timeoutMs,
          },
        ),
      );

      return { status: EhrOperationStatus.SUCCESS, data: res.data };
    } catch (err: any) {
      return this.classifyError(err, 'createAppointment');
    }
  }

  async getAppointmentById(
    externalId: string,
  ): Promise<EhrOperationResult<ExternalAppointment>> {
    try {
      const res = await firstValueFrom(
        this.http.get<ExternalAppointment>(
          `${this.baseUrl}/ehr/appointments/${externalId}`,
          {
            headers: { 'x-api-key': this.apiKey },
            timeout: this.timeoutMs,
          },
        ),
      );
      return { status: EhrOperationStatus.SUCCESS, data: res.data };
    } catch (err: any) {
      return this.classifyError(err, 'getAppointmentById');
    }
  }

  async findByCriteria(criteria: {
    providerId?: string;
    patientId?: string;
    idempotencyKey?: string;
    startDatetime?: Date;
  }): Promise<EhrOperationResult<ExternalAppointment[]>> {
    try {
      const params: any = {};
      if (criteria.providerId) params.providerId = criteria.providerId;
      if (criteria.patientId) params.patientId = criteria.patientId;

      const res = await firstValueFrom(
        this.http.get<ExternalAppointment[]>(
          `${this.baseUrl}/ehr/appointments`,
          {
            headers: { 'x-api-key': this.apiKey },
            params,
            timeout: this.timeoutMs,
          },
        ),
      );

      let data = res.data;
      if (criteria.idempotencyKey) {
        data = data.filter((a) => a.idempotencyKey === criteria.idempotencyKey);
      }
      if (criteria.startDatetime) {
        const target = criteria.startDatetime.getTime();
        data = data.filter(
          (a) => new Date(a.startDatetime).getTime() === target,
        );
      }

      return { status: EhrOperationStatus.SUCCESS, data };
    } catch (err: any) {
      return this.classifyError(err, 'findByCriteria');
    }
  }

  async cancelAppointment(
    externalId: string,
  ): Promise<EhrOperationResult<void>> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/ehr/appointments/${externalId}`, {
          headers: { 'x-api-key': this.apiKey },
          timeout: this.timeoutMs,
        }),
 
     );
      return { status: EhrOperationStatus.SUCCESS };
    } catch (err: any) {
      return this.classifyError(err, 'cancelAppointment');
    }
  }

  async updateAppointment(
    externalId: string,
    update: Partial<CreateAppointmentInput>,
  ): Promise<EhrOperationResult<ExternalAppointment>> {
    try {
      const res = await firstValueFrom(
        this.http.put<ExternalAppointment>(
          `${this.baseUrl}/ehr/appointments/${externalId}`,
          update,
          {
            headers: { 'x-api-key': this.apiKey },
            timeout: this.timeoutMs,
          },
        ),
      );
      return { status: EhrOperationStatus.SUCCESS, data: res.data };
    } catch (err: any) {
      return this.classifyError(err, 'updateAppointment');
    }
  }

  private classifyError<T>(err: any, opName: string): EhrOperationResult<T> {
    const code = err?.code || err?.response?.status;
    const message = err?.message || 'Unknown error';

    this.logger.warn(`[${opName}] error code=${code} message=${message}`);

    if (
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      err?.response?.status === 500 ||
      err?.response?.status === 502 ||
      err?.response?.status === 503 ||
      err?.response?.status === 504
    ) {
      return {
        status: EhrOperationStatus.UNKNOWN,
        errorCode: String(code),
        errorMessage: message,
      };
    }

    return {
      status: EhrOperationStatus.FAILED,
      errorCode: String(code),
      errorMessage: message,
    };
  }
}
