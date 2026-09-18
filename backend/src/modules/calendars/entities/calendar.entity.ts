import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('calendars')
export class Calendar {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'doctor_id', type: 'uuid' }) doctorId: string;

  @Index() @Column({ name: 'hospital_id', type: 'uuid' }) hospitalId: string;

  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;

  @Column({ type: 'varchar', length: 50, default: 'UTC' }) timezone: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
