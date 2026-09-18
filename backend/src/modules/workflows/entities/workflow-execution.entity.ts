import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum WorkflowStatus { RUNNING = 'RUNNING', COMPLETED = 'COMPLETED', FAILED = 'FAILED', RETRYING = 'RETRYING' }

@Entity('workflow_executions')
export class WorkflowExecution {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'workflow_name', type: 'varchar', length: 100 }) workflowName: string;

  @Index() @Column({ name: 'correlation_id', type: 'varchar', length: 100 }) correlationId: string;

  @Column({ type: 'enum', enum: WorkflowStatus, default: WorkflowStatus.RUNNING }) status: WorkflowStatus;

  @Column({ type: 'jsonb', default: '{}' }) state: any;

  @Column({ type: 'int', default: 0 }) attempts: number;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
