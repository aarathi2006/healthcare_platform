import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum UserRole {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  HOSPITAL_ADMIN = 'HOSPITAL_ADMIN',
  DOCTOR = 'DOCTOR',
  PATIENT = 'PATIENT',
}

@Entity('platform_users')
export class PlatformUser {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index({ unique: true }) @Column({ type: 'varchar', length: 200 }) email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 }) passwordHash: string;

  @Index() @Column({ type: 'enum', enum: UserRole }) role: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
