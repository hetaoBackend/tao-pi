import { Agent } from "@earendil-works/pi-agent-core";
import { getEnvApiKey } from "@earendil-works/pi-ai";
import { stderr, stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { createTransformContext, prefixLatestUserTextMessage } from "./agent/context-transform.js";
import { resolveConfiguredModel } from "./agent/model-config.js";
import { runStreamingPrompt } from "./agent/streaming-prompt.js";
import { buildSystemPrompt } from "./agent/system-prompt.js";
import { parseCliArgs } from "./cli/args.js";
import { runMultiTurnConversation } from "./cli/conversation.js";
import { renderCliHelp, renderSessionSummary, renderWelcome } from "./cli/ui.js";
import { SqliteSessionStore } from "./persistence/session-store.js";
import { createFileTools } from "./tools/file-tools.js";
import { createFirecrawlTools } from "./tools/firecrawl-tools.js";

const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4.1-mini";

main().catch((error: unknown) => {
  stderr.write(`Error: ${formatError(error)}\n`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const commandName = "tsx src/index.ts";

  if (cliArgs.help) {
    stdout.write(renderCliHelp(commandName));
    return;
  }

  const provider = cliArgs.overrides.provider ?? process.env.PI_PROVIDER ?? DEFAULT_PROVIDER;
  const modelId = cliArgs.overrides.model ?? process.env.PI_MODEL ?? DEFAULT_MODEL;
  const modelTemplateId = process.env.PI_MODEL_TEMPLATE;
  const modelBaseUrl = cliArgs.overrides.baseUrl ?? process.env.PI_BASE_URL;
  const workspaceRoot = process.env.PI_WORKSPACE_ROOT ?? process.cwd();
  const sessionDbPath = process.env.PI_SESSION_DB ?? join(process.cwd(), ".pi-sessions.sqlite");
  const contextPrefix = process.env.PI_CONTEXT_PREFIX;
  const promptTimeZone = process.env.PI_TIMEZONE;
  const debug = cliArgs.debug || process.env.PI_DEBUG?.toLowerCase() === "true";
  const modelLabel = `${provider}/${modelId}`;
  const tools = [
    ...createFileTools(workspaceRoot),
    ...createFirecrawlTools({
      apiKey: process.env.FIRECRAWL_API_KEY,
      baseUrl: process.env.FIRECRAWL_BASE_URL,
    }),
  ];

  const model = resolveConfiguredModel({
    provider,
    modelId,
    modelTemplateId,
    baseUrl: modelBaseUrl,
    compat: {
      ...parseOptionalBooleanCompat("supportsDeveloperRole", process.env.PI_SUPPORTS_DEVELOPER_ROLE),
    },
  });
  const apiKey = process.env.PI_API_KEY ?? getEnvApiKey(provider);
  const sessionStore = await SqliteSessionStore.open(sessionDbPath);
  const session = cliArgs.resume
    ? cliArgs.resumeTarget === "latest"
      ? await sessionStore.loadLatest()
      : await sessionStore.load(cliArgs.resumeTarget)
    : await sessionStore.create();
  const sessionMode = cliArgs.resume ? "resumed" : "new";

  if (!apiKey) {
    throw new Error(
      `No API key found for provider "${provider}". Set PI_API_KEY or the provider-specific API key env var.`,
    );
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt({ timeZone: promptTimeZone }),
      model,
      tools,
      messages: session.messages,
    },
    getApiKey: () => apiKey,
    transformContext: createTransformContext({
      sessionId: session.id,
      transform: ({ messages, sessionId }) => {
        if (!contextPrefix) {
          return messages;
        }

        return prefixLatestUserTextMessage(
          messages,
          `[transformContext session=${sessionId}]\n${contextPrefix}\n`,
        );
      },
    }),
  });

  const saveCurrentSession = () =>
    sessionStore.save({
      id: session.id,
      messages: agent.state.messages,
    });

  const beforeTurnStart = ({ event }: { event: { type: "turn_start" } }) => {
    if (!debug) {
      return;
    }

    stdout.write(
      `[hook:beforeTurnStart] ${new Date().toISOString()} session=${session.id} event=${event.type} messages=${agent.state.messages.length}\n`,
    );
  };

  const prompt = cliArgs.firstPrompt || (cliArgs.print ? await readPipedStdin() : "");
  if (cliArgs.print && !prompt) {
    throw new Error("--print requires a prompt or piped stdin");
  }

  if (!cliArgs.print) {
    stdout.write(
      renderWelcome({
        cwd: process.cwd(),
        modelLabel,
        sessionId: session.id,
        sessionMode,
        historyMessages: session.messages.length,
        dbPath: sessionDbPath,
        workspaceRoot,
        debug,
      }),
    );
  }

  if (prompt) {
    await runStreamingPrompt(agent, prompt, stdout, { beforeTurnStart });
    await saveCurrentSession();
    stdout.write("\n");
  }

  if (cliArgs.print) {
    return;
  }

  const readline = createInterface({
    input: stdin,
    output: stdout,
  });

  try {
    await runMultiTurnConversation(agent, {
      ask: () => readline.question("pi > "),
      output: stdout,
      beforeTurnStart,
      afterTurn: saveCurrentSession,
      helpText: () => renderCliHelp(commandName),
      sessionText: () =>
        renderSessionSummary({
          sessionId: session.id,
          sessionMode,
          historyMessages: agent.state.messages.length,
          dbPath: sessionDbPath,
          workspaceRoot,
          modelLabel,
        }),
    });
  } finally {
    readline.close();
  }
}

function parseOptionalBooleanCompat(key: string, value: string | undefined): Record<string, boolean> {
  if (value === undefined) {
    return {};
  }

  return {
    [key]: value.toLowerCase() === "true",
  };
}

async function readPipedStdin(): Promise<string> {
  if (stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
