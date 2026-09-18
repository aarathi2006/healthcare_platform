export interface CreateAppointmentInput {
  externalPatientId: string;
  externalProviderId: string;
  externalFacilityId?: string | null;
  startDatetime: Date;
  endDatetime: Date;
  idempotencyKey: string;
}

export enum EhrOperationStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

export interface EhrOperationResult<T = any> {
  status: EhrOperationStatus;
  data?: T;
  errorMessage?: string;
  errorCode?: string;
}

export interface ExternalAppointment {
  id: string;
  patientId: string;
  providerId: string;
  facilityId: string | null;
  startDatetime: string;
  endDatetime: string;
  status: string;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EhrConnector {
  createAppointment(
    input: CreateAppointmentInput,
    failureMode?: string,
  ): Promise<EhrOperationResult<ExternalAppointment>>;

  getAppointmentById(
    externalId: string,
  ): Promise<EhrOperationResult<ExternalAppointment>>;

  /**
   * Look up an appointment by idempotency key or provider+time.
   * Used for "unknown outcome" recovery.
   */
  findByCriteria(criteria: {
    providerId?: string;
    patientId?: string;
    idempotencyKey?: string;
    startDatetime?: Date;
  }): Promise<EhrOperationResult<ExternalAppointment[]>>;

  cancelAppointment(externalId: string): Promise<EhrOperationResult<void>>;

  updateAppointment(
    externalId: string,
    update: Partial<CreateAppointmentInput>,
  ): Promise<EhrOperationResult<ExternalAppointment>>;
}

