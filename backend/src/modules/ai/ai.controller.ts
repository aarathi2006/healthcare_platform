import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { MockAiAgentService } from './mock-ai-agent.service';
import { ChatDto } from './dto/chat.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('ai')
export class AiController {
  constructor(private agent: MockAiAgentService) {}

  @Public()
  @Post('chat')
  async chat(@Body() dto: ChatDto) {
    if (!dto.patientId) {
      throw new BadRequestException('patientId is required');
    }
    return this.agent.handleMessage({
      message: dto.message,
      conversationId: dto.conversationId,
      patientId: dto.patientId,
    });
  }
}

