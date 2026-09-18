export interface CapabilityDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  requiresConfirmation: boolean;
  handler: (input: TInput, ctx: CapabilityContext) => Promise<TOutput>;
}

export interface CapabilityContext {
  correlationId: string;
  conversationId?: string;
  patientId?: string;
  userId?: string;
}

export interface CapabilityExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

