import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('questionnaires')
export class Questionnaire {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'hospital_id', type: 'uuid' }) hospitalId: string;

  @Column({ type: 'varchar', length: 200 }) name: string;

  @Column({ type: 'text', nullable: true }) description: string | null;

  @Column({ type: 'jsonb', default: '[]' }) questions: any[];

  @Column({ name: 'assigned_to', type: 'varchar', length: 200, nullable: true }) assignedTo: string | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
