import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Hospital } from '../../hospitals/entities/hospital.entity';

@Entity('departments')
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'hospital_id', type: 'uuid' })
  hospitalId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ManyToOne(() => Hospital, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hospital_id' })
  hospital: Hospital;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

