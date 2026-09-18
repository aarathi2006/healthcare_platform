import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AppointmentStatus {
  REQUESTED = 'REQUESTED',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  RESCHEDULED = 'RESCHEDULED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
  FAILED = 'FAILED',
  SYNC_PENDING = 'SYNC_PENDING',
  RECONCILIATION_REQUIRED = 'RECONCILIATION_REQUIRED',
}

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'hospital_id', type: 'uuid' }) hospitalId: string;
  @Index() @Column({ name: 'doctor_id', type: 'uuid' }) doctorId: string;
  @Index() @Column({ name: 'patient_id', type: 'uuid' }) patientId: string;

  @Column({ name: 'appointment_type', type: 'varchar', length: 100 }) appointmentType: string;

@Index() @Column({ name: 'start_datetime', type: 'timestamptz' }) startDatetime: Date;
@Column({ name: 'end_datetime', type: 'timestamptz' }) endDatetime: Date;

  @Column({ type: 'enum', enum: AppointmentStatus, default: AppointmentStatus.REQUESTED }) status: AppointmentStatus;

  @Column({ name: 'external_appointment_id', type: 'varchar', length: 200, nullable: true }) externalAppointmentId: string | null;

  @Index({ unique: true }) @Column({ name: 'idempotency_key', type: 'varchar', length: 200 }) idempotencyKey: string;

  @Index() @Column({ name: 'correlation_id', type: 'varchar', length: 100 }) correlationId: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
