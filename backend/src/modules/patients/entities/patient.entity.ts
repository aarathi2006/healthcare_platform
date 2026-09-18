import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CommunicationPreference {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PHONE = 'PHONE',
  NONE = 'NONE',
}

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;

  @Column({ type: 'varchar', length: 200 }) name: string;

  @Index() @Column({ type: 'varchar', length: 200, nullable: true }) email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true }) phone: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true }) dateOfBirth: Date | null;

  @Column({ name: 'communication_preference', type: 'enum', enum: CommunicationPreference, default: CommunicationPreference.EMAIL })
  communicationPreference: CommunicationPreference;

  @Column({ name: 'external_patient_id', type: 'varchar', length: 200, nullable: true })
  externalPatientId: string | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

