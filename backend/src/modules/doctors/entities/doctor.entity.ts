import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum DoctorStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity('doctors')
export class Doctor {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'hospital_id', type: 'uuid' }) hospitalId: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true }) departmentId: string | null;

  @Column({ name: 'specialty_id', type: 'uuid', nullable: true }) specialtyId: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;

  @Column({ type: 'varchar', length: 200 }) name: string;

  @Column({ name: 'photo_url', type: 'text', nullable: true }) photoUrl: string | null;

  @Column({ type: 'text', nullable: true }) qualifications: string | null;

  @Column({ name: 'experience_years', type: 'int', default: 0 }) experienceYears: number;

  @Column({ type: 'jsonb', default: '[]' }) languages: string[];

  @Column({ name: 'consultation_types', type: 'jsonb', default: '[]' }) consultationTypes: string[];

  @Column({ name: 'appointment_duration_minutes', type: 'int', default: 30 }) appointmentDurationMinutes: number;

  @Column({ name: 'external_provider_id', type: 'varchar', length: 200, nullable: true }) externalProviderId: string | null;

  @Index() @Column({ type: 'enum', enum: DoctorStatus, default: DoctorStatus.INVITED }) status: DoctorStatus;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
