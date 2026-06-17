export interface WelcomeOptions {
  cwd: string;
  modelLabel: string;
  sessionId: string;
  sessionMode: "new" | "resumed";
  historyMessages: number;
  dbPath: string;
  workspaceRoot: string;
  debug: boolean;
}

const TOOL_NAMES = "read_file, write_file, web_search, web_fetch";

export interface SessionSummaryOptions {
  sessionId: string;
  sessionMode: "new" | "resumed";
  historyMessages: number;
  dbPath: string;
  workspaceRoot: string;
  modelLabel: string;
}

export function renderWelcome(options: WelcomeOptions): string {
  return [
    "Pi Agent",
    "",
    `  cwd      ${options.cwd}`,
    `  model    ${options.modelLabel}`,
    `  session  ${options.sessionId} (${options.sessionMode}, ${formatMessages(options.historyMessages)})`,
    `  tools    ${TOOL_NAMES}`,
    `  root     ${options.workspaceRoot}`,
    `  db       ${options.dbPath}`,
    `  debug    ${options.debug ? "on" : "off"}`,
    "",
    "Type /help for commands, /exit to quit.",
    "",
  ].join("\n");
}

export function renderSessionSummary(options: SessionSummaryOptions): string {
  return [
    "Session",
    `  id       ${options.sessionId}`,
    `  mode     ${options.sessionMode}`,
    `  history  ${formatMessages(options.historyMessages)}`,
    `  model    ${options.modelLabel}`,
    `  db       ${options.dbPath}`,
    `  tools    ${TOOL_NAMES}`,
    `  root     ${options.workspaceRoot}`,
    "",
  ].join("\n");
}

export function renderCliHelp(commandName: string): string {
  return [
    `Usage: ${commandName} [options] [prompt]`,
    "",
    "Starts an interactive session by default. Use -p/--print for one-shot output.",
    "",
    "Options:",
    "  -p, --print                  Print the response and exit",
    "  -r, --resume [session-id]    Resume a session, or latest when omitted",
    "  -c, --continue               Continue the latest session",
    "      --model <model>          Override PI_MODEL for this run",
    "      --provider <provider>    Override PI_PROVIDER for this run",
    "      --base-url <url>         Override PI_BASE_URL for this run",
    "      --debug                  Show hook and runtime diagnostics",
    "  -h, --help                   Show this help",
    "",
    "Environment:",
    "  FIRECRAWL_API_KEY            Enables web_search and web_fetch",
    "  FIRECRAWL_BASE_URL           Optional Firecrawl API base URL",
    "",
    "Interactive commands:",
    "  /help                        Show commands",
    "  /session                     Show current session details",
    "  /clear                       Clear the terminal",
    "  /exit                        Exit the session",
    "",
  ].join("\n");
}

function formatMessages(count: number): string {
  return count === 1 ? "1 message" : `${count} messages`;
}
