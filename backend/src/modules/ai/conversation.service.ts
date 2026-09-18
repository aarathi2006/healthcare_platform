import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Conversation,
  ConversationChannel,
  ConversationStatus,
} from '../conversations/entities/conversation.entity';
import {
  ConversationMessage,
  MessageRole,
} from '../conversations/entities/conversation-message.entity';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private convRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private msgRepo: Repository<ConversationMessage>,
  ) {}

  async getOrCreate(
    conversationId: string | undefined,
    patientId: string,
    channel: ConversationChannel = ConversationChannel.TEXT,
  ): Promise<Conversation> {
    if (conversationId) {
      const c = await this.convRepo.findOne({ where: { id: conversationId } });
      if (c) return c;
    }
    return this.convRepo.save(
      this.convRepo.create({
        patientId,
        channel,
        status: ConversationStatus.ACTIVE,
        context: {},
      }),
    );
  }

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
  ): Promise<ConversationMessage> {
    return this.msgRepo.save(
      this.msgRepo.create({ conversationId, role, content }),
    );
  }

  async getHistory(
    conversationId: string,
    limit = 20,
  ): Promise<ConversationMessage[]> {
    return this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async updateContext(conversationId: string, patch: any): Promise<void> {
    const c = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!c) return;
    c.context = { ...(c.context || {}), ...patch };
    await this.convRepo.save(c);
  }

  async getContext(conversationId: string): Promise<any> {
    const c = await this.convRepo.findOne({ where: { id: conversationId } });
    return c?.context || {};
  }
}

