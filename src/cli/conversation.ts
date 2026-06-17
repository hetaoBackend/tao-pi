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
  slashCommands?: readonly InteractiveSlashCommand[];
}

export interface InteractiveSlashCommand {
  name: string;
  description: string;
  toPrompt: (input: InteractiveSlashCommandInput) => string;
}

export interface InteractiveSlashCommandInput {
  command: string;
  args: string;
  raw: string;
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
      await handleSlashCommand(agent, trimmedInput, options);
      continue;
    }

    await runStreamingPrompt(agent, trimmedInput, options.output, {
      beforeTurnStart: options.beforeTurnStart,
    });
    await options.afterTurn?.();
    options.output.write("\n");
  }
}

async function handleSlashCommand(
  agent: StreamingAgent,
  rawCommand: string,
  options: MultiTurnConversationOptions,
): Promise<void> {
  if (rawCommand === "/help") {
    options.output.write(options.helpText?.() ?? "No help text configured.\n");
    return;
  }

  if (rawCommand === "/session") {
    options.output.write(options.sessionText?.() ?? "No session details configured.\n");
    return;
  }

  if (rawCommand === "/clear") {
    options.output.write("\u001Bc");
    return;
  }

  const parsedCommand = parseSlashCommand(rawCommand);
  const pluginCommand = options.slashCommands?.find((command) => command.name === parsedCommand.command);
  if (pluginCommand) {
    await runStreamingPrompt(agent, pluginCommand.toPrompt(parsedCommand), options.output, {
      beforeTurnStart: options.beforeTurnStart,
    });
    await options.afterTurn?.();
    options.output.write("\n");
    return;
  }

  options.output.write(`Unknown command: ${rawCommand}\nType /help for available commands.\n`);
}

function parseSlashCommand(rawCommand: string): InteractiveSlashCommandInput {
  const withoutSlash = rawCommand.slice(1);
  const separatorIndex = withoutSlash.search(/\s/);
  if (separatorIndex === -1) {
    return {
      command: withoutSlash,
      args: "",
      raw: rawCommand,
    };
  }

  return {
    command: withoutSlash.slice(0, separatorIndex),
    args: withoutSlash.slice(separatorIndex).trim(),
    raw: rawCommand,
  };
}
