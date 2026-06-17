import type { Writable } from "node:stream";

export interface StreamingAgent {
  subscribe(callback: (event: unknown) => Promise<void> | void): (() => void) | void;
  prompt(input: string): Promise<unknown>;
}

export interface BeforeTurnStartContext {
  event: { type: "turn_start" };
}

export interface StreamingPromptHooks {
  beforeTurnStart?: (context: BeforeTurnStartContext) => Promise<void> | void;
  showToolEvents?: boolean;
  maxToolDisplayChars?: number;
}

const DEFAULT_MAX_TOOL_DISPLAY_CHARS = 2000;

export async function runStreamingPrompt(
  agent: StreamingAgent,
  input: string,
  output: Writable,
  hooks: StreamingPromptHooks = {},
): Promise<void> {
  const showToolEvents = hooks.showToolEvents ?? true;
  const maxToolDisplayChars = hooks.maxToolDisplayChars ?? DEFAULT_MAX_TOOL_DISPLAY_CHARS;
  let wroteOutput = false;
  let outputEndsWithNewline = true;

  const writeText = (text: string) => {
    output.write(text);
    wroteOutput = wroteOutput || text.length > 0;
    outputEndsWithNewline = text.endsWith("\n");
  };

  const writeBlock = (lines: string[]) => {
    if (wroteOutput && !outputEndsWithNewline) {
      output.write("\n");
    }

    output.write(`${lines.join("\n")}\n`);
    wroteOutput = true;
    outputEndsWithNewline = true;
  };

  const unsubscribe = agent.subscribe(async (event) => {
    if (isTurnStartEvent(event)) {
      await hooks.beforeTurnStart?.({ event });
      return;
    }

    if (isTextDeltaEvent(event)) {
      writeText(event.assistantMessageEvent.delta);
      return;
    }

    if (showToolEvents && isToolExecutionStartEvent(event)) {
      writeBlock([
        `[tool call] ${event.toolName}`,
        `args: ${truncate(formatJson(event.args), maxToolDisplayChars)}`,
      ]);
      return;
    }

    if (showToolEvents && isToolExecutionEndEvent(event)) {
      writeBlock([
        `[tool result] ${event.toolName} ${event.isError ? "error" : "ok"}`,
        truncate(formatToolResult(event.result), maxToolDisplayChars),
      ]);
      return;
    }

    if (isAssistantErrorEndEvent(event)) {
      writeBlock([`[assistant error] ${event.message.errorMessage}`]);
    }
  });

  try {
    await agent.prompt(input);
  } finally {
    unsubscribe?.();
  }
}

function isTurnStartEvent(event: unknown): event is { type: "turn_start" } {
  return Boolean(event && typeof event === "object" && (event as { type?: unknown }).type === "turn_start");
}

function isTextDeltaEvent(event: unknown): event is {
  type: "message_update";
  assistantMessageEvent: { type: "text_delta"; delta: string };
} {
  if (!event || typeof event !== "object") {
    return false;
  }

  const candidate = event as {
    type?: unknown;
    assistantMessageEvent?: { type?: unknown; delta?: unknown };
  };

  return (
    candidate.type === "message_update" &&
    candidate.assistantMessageEvent?.type === "text_delta" &&
    typeof candidate.assistantMessageEvent.delta === "string"
  );
}

function isToolExecutionStartEvent(event: unknown): event is {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args: unknown;
} {
  if (!event || typeof event !== "object") {
    return false;
  }

  const candidate = event as { type?: unknown; toolCallId?: unknown; toolName?: unknown; args?: unknown };

  return (
    candidate.type === "tool_execution_start" &&
    typeof candidate.toolCallId === "string" &&
    typeof candidate.toolName === "string"
  );
}

function isToolExecutionEndEvent(event: unknown): event is {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
} {
  if (!event || typeof event !== "object") {
    return false;
  }

  const candidate = event as {
    type?: unknown;
    toolCallId?: unknown;
    toolName?: unknown;
    result?: unknown;
    isError?: unknown;
  };

  return (
    candidate.type === "tool_execution_end" &&
    typeof candidate.toolCallId === "string" &&
    typeof candidate.toolName === "string" &&
    typeof candidate.isError === "boolean"
  );
}

function isAssistantErrorEndEvent(event: unknown): event is {
  type: "message_end";
  message: { role: "assistant"; stopReason: "error" | "aborted"; errorMessage: string };
} {
  if (!event || typeof event !== "object") {
    return false;
  }

  const candidate = event as {
    type?: unknown;
    message?: { role?: unknown; stopReason?: unknown; errorMessage?: unknown };
  };

  return (
    candidate.type === "message_end" &&
    candidate.message?.role === "assistant" &&
    (candidate.message.stopReason === "error" || candidate.message.stopReason === "aborted") &&
    typeof candidate.message.errorMessage === "string" &&
    candidate.message.errorMessage.length > 0
  );
}

function formatToolResult(result: unknown): string {
  if (isObject(result) && Array.isArray(result.content)) {
    const textBlocks = result.content.flatMap((content) => {
      if (!isObject(content)) {
        return [];
      }

      if (content.type === "text" && typeof content.text === "string") {
        return [content.text];
      }

      if (content.type === "image") {
        return [`[image ${typeof content.mimeType === "string" ? content.mimeType : "unknown"}]`];
      }

      return [];
    });

    if (textBlocks.length > 0) {
      return textBlocks.join("\n");
    }
  }

  return formatJson(result);
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}...`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
