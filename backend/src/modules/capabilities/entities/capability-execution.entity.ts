import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('capability_executions')
export class CapabilityExecution {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'correlation_id', type: 'varchar', length: 100 }) correlationId: string;

  @Column({ name: 'capability_name', type: 'varchar', length: 100 }) capabilityName: string;

  @Column({ type: 'jsonb', nullable: true }) input: any;
  @Column({ type: 'jsonb', nullable: true }) output: any;

  @Column({ type: 'varchar', length: 20 }) status: string;

  @Column({ type: 'text', nullable: true }) error: string | null;

  @Column({ name: 'duration_ms', type: 'int', default: 0 }) durationMs: number;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
