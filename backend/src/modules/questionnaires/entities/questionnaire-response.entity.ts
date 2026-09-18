import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ResponseStatus { PENDING = 'PENDING', COMPLETED = 'COMPLETED' }

@Entity('questionnaire_responses')
export class QuestionnaireResponse {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'questionnaire_id', type: 'uuid' }) questionnaireId: string;

  @Index() @Column({ name: 'appointment_id', type: 'uuid' }) appointmentId: string;

  @Index() @Column({ name: 'patient_id', type: 'uuid' }) patientId: string;

  @Column({ type: 'jsonb', default: '{}' }) responses: any;

  @Column({ type: 'enum', enum: ResponseStatus, default: ResponseStatus.PENDING }) status: ResponseStatus;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
