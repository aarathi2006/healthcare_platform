import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'correlation_id', type: 'varchar', length: 100, nullable: true }) correlationId: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 50 }) actorType: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId: string | null;

  @Index() @Column({ type: 'varchar', length: 100 }) action: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100, nullable: true }) entityType: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true }) entityId: string | null;

  @Column({ type: 'jsonb', nullable: true }) metadata: any;

  @Index() @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
