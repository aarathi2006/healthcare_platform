import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ConversationChannel { WEB_VOICE = 'WEB_VOICE', PHONE = 'PHONE', TEXT = 'TEXT' }
export enum ConversationStatus { ACTIVE = 'ACTIVE', ENDED = 'ENDED' }

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'patient_id', type: 'uuid' }) patientId: string;

  @Column({ type: 'enum', enum: ConversationChannel }) channel: ConversationChannel;

  @Index() @Column({ type: 'enum', enum: ConversationStatus, default: ConversationStatus.ACTIVE }) status: ConversationStatus;

  @Column({ type: 'jsonb', default: '{}' }) context: any;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
