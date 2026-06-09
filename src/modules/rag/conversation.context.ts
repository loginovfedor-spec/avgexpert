import type { ChatMessage } from '../../types/chat.types';

type TruncateOptions = {
  maxTokens?: number;
  summarizeHook?: (messages: ChatMessage[]) => Promise<string | null>;
};

function estimateTokens(messages: ChatMessage[]): number {
  const text = messages.map((m) => m.content || '').join('\n');

  return Math.ceil(text.length / 4);
}

function splitSystemAndRest(messages: ChatMessage[]): {
  system: ChatMessage[];
  rest: ChatMessage[];
} {
  const system: ChatMessage[] = [];
  const rest: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system' && system.length === rest.length) {
      system.push(message);
    } else {
      rest.push(message);
    }
  }

  return { system, rest };
}

export async function truncateConversationMessages(
  messages: ChatMessage[],
  options: TruncateOptions = {}
): Promise<ChatMessage[]> {
  const maxTokens = options.maxTokens ?? 100000;
  const summarizeHook = options.summarizeHook ?? defaultSummarizeHook;

  if (estimateTokens(messages) <= maxTokens) {
    return messages;
  }

  const summary = await summarizeHook(messages);
  const { system, rest } = splitSystemAndRest(messages);

  if (summary) {
    const summaryMessage: ChatMessage = {
      role: 'system',
      content: `Conversation summary:\n${summary}`,
    };
    return [...system, summaryMessage, ...rest.slice(-6)];
  }

  for (let i = 0; i < rest.length; i++) {
    const candidate = [...system, ...rest.slice(i)];
    if (estimateTokens(candidate) <= maxTokens) {
      return candidate;
    }
  }

  const lastUser = [...rest].reverse().find((m) => m.role === 'user');
  return lastUser ? [...system, lastUser] : [...system, ...rest.slice(-1)];
}

export async function defaultSummarizeHook(
  _messages: ChatMessage[]
): Promise<string | null> {
  return null;
}

module.exports = {
  truncateConversationMessages,
  defaultSummarizeHook,
  estimateConversationTokens: estimateTokens,
};
