import { StreamEvent, ModelUsage } from '../../types/chat.types';

const ProviderEvents = {
  delta: (text: string): StreamEvent => ({ type: 'delta', text }),
  
  toolCall: (toolCall: unknown): StreamEvent => ({ type: 'tool_call', toolCall }),
  
  done: (finishReason: string = 'stop', usage: ModelUsage | null = null): StreamEvent => ({ 
    type: 'done', 
    finishReason, 
    usage: usage || undefined 
  }),
  
  error: (message: string, code: string = 'provider_error'): StreamEvent => ({ type: 'error', message, code })
};

export = ProviderEvents;
