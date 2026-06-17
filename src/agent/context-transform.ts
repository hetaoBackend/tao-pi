import type { AgentMessage } from "@earendil-works/pi-agent-core";

export interface TransformContextHookContext {
  messages: AgentMessage[];
  sessionId: string;
  signal?: AbortSignal;
}

export type TransformContextHook = (
  context: TransformContextHookContext,
) => AgentMessage[] | Promise<AgentMessage[]>;

export interface CreateTransformContextOptions {
  sessionId: string;
  transform?: TransformContextHook;
}

export function createTransformContext(options: CreateTransformContextOptions) {
  return async (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> => {
    const copiedMessages = messages.slice();
    if (!options.transform) {
      return copiedMessages;
    }

    return options.transform({
      messages: copiedMessages,
      sessionId: options.sessionId,
      signal,
    });
  };
}

export function prefixLatestUserTextMessage(
  messages: AgentMessage[],
  prefix: string,
): AgentMessage[] {
  const nextMessages = messages.slice();

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index];
    if (message?.role !== "user" || typeof message.content !== "string") {
      continue;
    }

    nextMessages[index] = {
      ...message,
      content: `${prefix}${message.content}`,
    };
    break;
  }

  return nextMessages;
}
