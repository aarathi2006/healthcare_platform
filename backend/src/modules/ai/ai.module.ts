import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { MockAiAgentService } from './mock-ai-agent.service';
import { ConversationService } from './conversation.service';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { Conversation } from '../conversations/entities/conversation.entity';
import { ConversationMessage } from '../conversations/entities/conversation-message.entity';

@Module({
  imports: [
    ConfigModule,
    CapabilitiesModule,
    TypeOrmModule.forFeature([Conversation, ConversationMessage]),
  ],
  controllers: [AiController],
  providers: [MockAiAgentService, ConversationService],
  exports: [MockAiAgentService],
})
export class AiModule {}

