import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum MessageRole { USER = 'USER', ASSISTANT = 'ASSISTANT', SYSTEM = 'SYSTEM' }

@Entity('conversation_messages')
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'conversation_id', type: 'uuid' }) conversationId: string;

  @Column({ type: 'enum', enum: MessageRole }) role: MessageRole;

  @Column({ type: 'text' }) content: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
