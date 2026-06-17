import type { AgentSlashCommand } from "../../plugins/plugin-registry.js";

export type TuiCommandSource = "builtin" | "plugin";

export interface TuiCommand {
  name: string;
  description: string;
  source: TuiCommandSource;
  toPrompt?: AgentSlashCommand["toPrompt"];
}

export type TuiSubmission =
  | { type: "builtin"; name: string; args: string; raw: string }
  | { type: "prompt"; prompt: string; raw: string; sourceCommand?: string }
  | { type: "error"; message: string; raw: string };

export const BUILTIN_TUI_COMMANDS: readonly TuiCommand[] = [
  { name: "help", description: "Show commands, or details for one command.", source: "builtin" },
  { name: "session", description: "Show current session details.", source: "builtin" },
  { name: "clear", description: "Clear the visible terminal transcript.", source: "builtin" },
  { name: "exit", description: "Exit the TUI session.", source: "builtin" },
  { name: "quit", description: "Exit the TUI session.", source: "builtin" },
];

export function buildTuiCommands(pluginCommands: readonly AgentSlashCommand[] = []): TuiCommand[] {
  const commands = [...BUILTIN_TUI_COMMANDS];
  for (const command of pluginCommands) {
    commands.push({
      name: command.name,
      description: command.description,
      source: "plugin",
      toPrompt: command.toPrompt,
    });
  }
  return commands;
}

export function filterTuiCommands(commands: readonly TuiCommand[], query: string): TuiCommand[] {
  const normalizedQuery = normalizeCommandName(query);
  if (!normalizedQuery) {
    return [...commands];
  }

  return commands
    .filter((command) => {
      const name = command.name.toLowerCase();
      const description = command.description.toLowerCase();
      return name.includes(normalizedQuery) || description.includes(normalizedQuery);
    })
    .sort((left, right) => scoreCommand(right, normalizedQuery) - scoreCommand(left, normalizedQuery));
}

export function resolveTuiSubmission(rawInput: string, commands: readonly TuiCommand[]): TuiSubmission {
  const raw = rawInput.trim();
  if (!raw) {
    return { type: "error", message: "Input is empty.", raw: rawInput };
  }

  if (!raw.startsWith("/")) {
    return { type: "prompt", prompt: raw, raw };
  }

  const parsed = parseSlash(raw);
  const command = commands.find((candidate) => candidate.name.toLowerCase() === parsed.name);
  if (!command) {
    return {
      type: "error",
      message: `Unknown command: /${parsed.name}\nType /help for available commands.`,
      raw,
    };
  }

  if (command.source === "builtin") {
    return { type: "builtin", name: command.name, args: parsed.args, raw };
  }

  return {
    type: "prompt",
    prompt: command.toPrompt?.({ command: command.name, args: parsed.args, raw }) ?? raw,
    raw,
    sourceCommand: command.name,
  };
}

export function formatTuiHelp(commands: readonly TuiCommand[], target?: string): string {
  if (target) {
    const normalizedTarget = normalizeCommandName(target);
    const command = commands.find((candidate) => candidate.name.toLowerCase() === normalizedTarget);
    if (!command) {
      return `Unknown command: /${target}. Type /help for available commands.`;
    }
    return `/${command.name} - ${command.description}`;
  }

  return ["Available commands:", ...commands.map((command) => `/${command.name} - ${command.description}`)].join(
    "\n",
  );
}

export function getSlashCommandQuery(input: string): string | null {
  if (!input.startsWith("/")) {
    return null;
  }
  if (/\s/.test(input)) {
    return null;
  }
  return input.slice(1);
}

function parseSlash(raw: string): { name: string; args: string } {
  const withoutSlash = raw.slice(1);
  const separatorIndex = withoutSlash.search(/\s/);
  if (separatorIndex === -1) {
    return { name: normalizeCommandName(withoutSlash), args: "" };
  }

  return {
    name: normalizeCommandName(withoutSlash.slice(0, separatorIndex)),
    args: withoutSlash.slice(separatorIndex).trim(),
  };
}

function normalizeCommandName(value: string): string {
  return value.replace(/^\//, "").trim().toLowerCase();
}

function scoreCommand(command: TuiCommand, query: string): number {
  const name = command.name.toLowerCase();
  const description = command.description.toLowerCase();
  if (name.startsWith(query)) {
    return 3;
  }
  if (name.includes(query)) {
    return 2;
  }
  if (description.includes(query)) {
    return 1;
  }
  return 0;
}
