import type { Writable } from "node:stream";
import type { BeforeTurnStartContext, StreamingAgent } from "../agent/streaming-prompt.js";
import { runStreamingPrompt } from "../agent/streaming-prompt.js";

const EXIT_COMMANDS = new Set(["/exit", "/quit", "exit", "quit"]);

export interface MultiTurnConversationOptions {
  ask: () => Promise<string | undefined>;
  output: Writable;
  beforeTurnStart?: (context: BeforeTurnStartContext) => Promise<void> | void;
  afterTurn?: () => Promise<void> | void;
  helpText?: () => string;
  sessionText?: () => string;
}

export async function runMultiTurnConversation(
  agent: StreamingAgent,
  options: MultiTurnConversationOptions,
): Promise<void> {
  while (true) {
    const input = await options.ask();
    if (input === undefined) {
      return;
    }

    const trimmedInput = input.trim();
    if (!trimmedInput) {
      continue;
    }

    if (EXIT_COMMANDS.has(trimmedInput.toLowerCase())) {
      return;
    }

    if (trimmedInput.startsWith("/")) {
      handleSlashCommand(trimmedInput, options);
      continue;
    }

    await runStreamingPrompt(agent, trimmedInput, options.output, {
      beforeTurnStart: options.beforeTurnStart,
    });
    await options.afterTurn?.();
    options.output.write("\n");
  }
}

function handleSlashCommand(command: string, options: MultiTurnConversationOptions): void {
  if (command === "/help") {
    options.output.write(options.helpText?.() ?? "No help text configured.\n");
    return;
  }

  if (command === "/session") {
    options.output.write(options.sessionText?.() ?? "No session details configured.\n");
    return;
  }

  if (command === "/clear") {
    options.output.write("\u001Bc");
    return;
  }

  options.output.write(`Unknown command: ${command}\nType /help for available commands.\n`);
}
