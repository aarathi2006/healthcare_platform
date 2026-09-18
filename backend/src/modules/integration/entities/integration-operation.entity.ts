import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum IntegrationStatus {
  STARTED = 'STARTED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
  VERIFIED = 'VERIFIED',
  RECONCILED = 'RECONCILED',
}

@Entity('integration_operations')
export class IntegrationOperation {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'correlation_id', type: 'varchar', length: 100 }) correlationId: string;

  @Column({ name: 'operation_type', type: 'varchar', length: 100 }) operationType: string;

  @Column({ name: 'request_payload', type: 'jsonb', nullable: true }) requestPayload: any;

  @Column({ name: 'response_payload', type: 'jsonb', nullable: true }) responsePayload: any;

  @Index() @Column({ type: 'enum', enum: IntegrationStatus, default: IntegrationStatus.STARTED }) status: IntegrationStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 }) retryCount: number;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
