import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ReconciliationStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED',
}

@Entity('reconciliation_records')
export class ReconciliationRecord {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'correlation_id', type: 'varchar', length: 100 }) correlationId: string;

  @Column({ name: 'appointment_id', type: 'uuid', nullable: true }) appointmentId: string | null;

  @Column({ type: 'text' }) reason: string;

  @Index() @Column({ type: 'enum', enum: ReconciliationStatus, default: ReconciliationStatus.OPEN }) status: ReconciliationStatus;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true }) assignedTo: string | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true }) resolutionNotes: string | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
