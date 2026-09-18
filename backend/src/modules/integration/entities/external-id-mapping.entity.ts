import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('external_id_mappings')
export class ExternalIdMapping {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'internal_entity_type', type: 'varchar', length: 50 }) internalEntityType: string;

  @Index() @Column({ name: 'internal_id', type: 'uuid' }) internalId: string;

  @Column({ name: 'external_system', type: 'varchar', length: 100 }) externalSystem: string;

  @Index() @Column({ name: 'external_id', type: 'varchar', length: 200 }) externalId: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
