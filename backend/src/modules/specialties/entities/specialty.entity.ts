import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('specialties')
export class Specialty {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'hospital_id', type: 'uuid' }) hospitalId: string;

  @Column({ type: 'varchar', length: 200 }) name: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
