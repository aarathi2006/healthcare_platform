export interface AgentTurnResult {
  reply: string;
  conversationId: string;
  correlationId: string;
  capabilityCalls: Array<{
    name: string;
    input: any;
    success: boolean;
    output: any;
  }>;
  context: any;
}

