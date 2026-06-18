import { Agent } from "@earendil-works/pi-agent-core";
import { getEnvApiKey } from "@earendil-works/pi-ai";
import { stderr, stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { resolveConfiguredModel } from "./agent/model-config.js";
import { loadProjectContext } from "./agent/project-context.js";
import { runStreamingPrompt } from "./agent/streaming-prompt.js";
import { buildSystemPrompt } from "./agent/system-prompt.js";
import { parseCliArgs } from "./cli/args.js";
import { APP_VERSION } from "./cli/app-info.js";
import { resolveCliCommandName } from "./cli/command-name.js";
import { runMultiTurnConversation } from "./cli/conversation.js";
import { shouldUseTui } from "./cli/runtime-mode.js";
import { askTerminalSetupPrompt, runSetupCommand } from "./cli/setup.js";
import { readPipedStdin } from "./cli/stdin.js";
import { renderCliHelp, renderSessionSummary, renderWelcome } from "./cli/ui.js";
import { loadAppConfig } from "./config.js";
import { SqliteSessionStore } from "./persistence/session-store.js";
import { createConfiguredPlugins } from "./plugins/default-plugins.js";
import { createAgentPluginRuntime } from "./plugins/plugin-registry.js";
import { createCommandTools } from "./tools/command-tools.js";
import { createFileTools } from "./tools/file-tools.js";
import { createFirecrawlTools } from "./tools/firecrawl-tools.js";
import { formatError } from "./utils/errors.js";

main().catch((error: unknown) => {
  stderr.write(`Error: ${formatError(error)}\n`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const commandName = resolveCliCommandName(process.argv);

  if (cliArgs.help) {
    stdout.write(renderCliHelp(commandName));
    return;
  }

  if (cliArgs.command === "setup") {
    await runSetupCommand({
      env: process.env,
      output: stdout,
      ask: (prompt) => askTerminalSetupPrompt(stdin, stdout, prompt),
    });
    return;
  }

  const config = loadAppConfig({
    cwd: process.cwd(),
    env: process.env,
    overrides: cliArgs.overrides,
    debugFlag: cliArgs.debug,
    getProviderApiKey: getConfiguredProviderApiKey,
  });
  const modelLabel = `${config.provider}/${config.modelId}`;
  const projectContext = await loadProjectContext({ workspaceRoot: config.workspaceRoot });
  const projectContextFiles = projectContext.map((entry) => entry.path);
  const pluginRuntime = createAgentPluginRuntime(
    createConfiguredPlugins({
      workspaceRoot: config.workspaceRoot,
      configuredPluginIds: config.configuredPluginIds,
      memoryDir: config.memoryDir,
      skillDirs: config.skillDirs,
    }),
  );
  const tools = [
    ...pluginRuntime.tools,
    ...createFileTools(config.workspaceRoot),
    ...createCommandTools(config.workspaceRoot),
    ...createFirecrawlTools({
      apiKey: config.firecrawlApiKey,
      baseUrl: config.firecrawlBaseUrl,
    }),
  ];
  const toolNames = tools.map((tool) => tool.name);

  const model = resolveConfiguredModel({
    provider: config.provider,
    modelId: config.modelId,
    modelTemplateId: config.modelTemplateId,
    baseUrl: config.modelBaseUrl,
    compat: config.modelCompat,
  });
  const apiKey = config.apiKey;
  const sessionStore = await SqliteSessionStore.open(config.sessionDbPath);
  const resumeTarget = cliArgs.resumeTarget ?? "latest";
  const session = cliArgs.resume
    ? resumeTarget === "latest"
      ? await sessionStore.loadLatest()
      : await sessionStore.load(resumeTarget)
    : await sessionStore.create();
  const sessionMode = cliArgs.resume ? "resumed" : "new";

  if (!apiKey) {
    throw new Error(
      `No API key found for provider "${config.provider}". Set PI_API_KEY, the provider-specific API key env var, or run setup.`,
    );
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt({
        timeZone: config.promptTimeZone,
        projectContext,
        pluginPromptSections: pluginRuntime.systemPromptSections,
      }),
      model,
      tools,
      messages: session.messages,
    },
    getApiKey: () => apiKey,
  });

  const saveCurrentSession = () =>
    sessionStore.save({
      id: session.id,
      messages: agent.state.messages,
    });

  const beforeTurnStart = ({ event }: { event: { type: "turn_start" } }) => {
    if (!config.debug) {
      return;
    }

    stdout.write(
      `[hook:beforeTurnStart] ${new Date().toISOString()} session=${session.id} event=${event.type} messages=${agent.state.messages.length}\n`,
    );
  };

  const prompt = cliArgs.firstPrompt || (cliArgs.print ? await readPipedStdin(stdin) : "");
  if (cliArgs.print && !prompt) {
    throw new Error("--print requires a prompt or piped stdin");
  }

  if (cliArgs.print) {
    await runStreamingPrompt(agent, prompt, stdout, { beforeTurnStart });
    await saveCurrentSession();
    stdout.write("\n");
    return;
  }

  if (
    shouldUseTui({
      print: cliArgs.print,
      stdinIsTTY: Boolean(stdin.isTTY),
      stdoutIsTTY: Boolean(stdout.isTTY),
    })
  ) {
    try {
      const { runTuiConversation } = await import("./cli/tui/index.js");
      await runTuiConversation({
        agent,
        output: stdout,
        appVersion: APP_VERSION,
        modelLabel,
        sessionId: session.id,
        sessionMode,
        workspaceRoot: config.workspaceRoot,
        toolNames,
        pluginIds: pluginRuntime.pluginIds,
        projectContextFiles,
        slashCommands: pluginRuntime.slashCommands,
        firstPrompt: prompt || undefined,
        helpText: () => renderCliHelp(commandName, pluginRuntime.slashCommands),
        sessionText: () =>
          renderSessionSummary({
            sessionId: session.id,
            sessionMode,
            historyMessages: agent.state.messages.length,
            dbPath: config.sessionDbPath,
            workspaceRoot: config.workspaceRoot,
            modelLabel,
            toolNames,
            pluginIds: pluginRuntime.pluginIds,
            projectContextFiles,
          }),
        afterTurn: saveCurrentSession,
      });
      return;
    } catch (error) {
      stderr.write(`TUI unavailable: ${formatError(error)}\nFalling back to plain terminal mode.\n`);
    }
  }

  stdout.write(
    renderWelcome({
      cwd: process.cwd(),
      modelLabel,
      sessionId: session.id,
      sessionMode,
      historyMessages: session.messages.length,
      dbPath: config.sessionDbPath,
      workspaceRoot: config.workspaceRoot,
      toolNames,
      pluginIds: pluginRuntime.pluginIds,
      projectContextFiles,
      debug: config.debug,
    }),
  );

  if (prompt) {
    await runStreamingPrompt(agent, prompt, stdout, { beforeTurnStart });
    await saveCurrentSession();
    stdout.write("\n");
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
      helpText: () => renderCliHelp(commandName, pluginRuntime.slashCommands),
      sessionText: () =>
        renderSessionSummary({
          sessionId: session.id,
          sessionMode,
          historyMessages: agent.state.messages.length,
          dbPath: config.sessionDbPath,
          workspaceRoot: config.workspaceRoot,
          modelLabel,
          toolNames,
          pluginIds: pluginRuntime.pluginIds,
          projectContextFiles,
        }),
      slashCommands: pluginRuntime.slashCommands,
    });
  } finally {
    readline.close();
  }
}

function getConfiguredProviderApiKey(provider: string, env: NodeJS.ProcessEnv): string | undefined {
  const providerEnv = Object.fromEntries(Object.entries(env).filter(hasEnvValue));
  return getEnvApiKey(provider, providerEnv);
}

function hasEnvValue(entry: [string, string | undefined]): entry is [string, string] {
  return entry[1] !== undefined;
}
