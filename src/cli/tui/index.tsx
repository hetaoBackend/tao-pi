import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { render, useApp } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Writable } from "node:stream";
import type { AgentSlashCommand } from "../../plugins/plugin-registry.js";
import {
  buildTuiCommands,
  formatTuiHelp,
  resolveTuiSubmission,
  type TuiCommand,
} from "./command-registry.js";
import { TuiApp } from "./app.js";
import {
  createInitialTuiViewState,
  reduceTuiViewState,
  type TuiViewAction,
  type TuiViewState,
} from "./view-state.js";

export interface UserTextMessage {
  role: "user";
  content: Array<{ type: "text"; text: string }>;
  timestamp: number;
}

export interface TuiControllerAgent {
  state: { isStreaming: boolean };
  prompt(input: string): Promise<unknown>;
  steer(message: UserTextMessage): void;
  abort(): void;
  subscribe(listener: (event: AgentEvent, signal?: AbortSignal) => Promise<void> | void): (() => void) | void;
}

export interface RunTuiConversationOptions {
  agent: TuiControllerAgent;
  output: Writable;
  appVersion: string;
  modelLabel: string;
  sessionId: string;
  sessionMode: "new" | "resumed";
  workspaceRoot: string;
  toolNames: string[];
  pluginIds: string[];
  projectContextFiles: string[];
  slashCommands: readonly AgentSlashCommand[];
  firstPrompt?: string;
  helpText: () => string;
  sessionText: () => string;
  afterTurn?: () => Promise<void> | void;
}

export interface TuiControllerOptions {
  agent: TuiControllerAgent;
  commands: readonly TuiCommand[];
  dispatch: (action: TuiViewAction) => void;
  helpText: () => string;
  sessionText: () => string;
  clear: () => void;
  exit: () => void;
  afterTurn?: () => Promise<void> | void;
}

export function shouldSteer(isStreaming: boolean): boolean {
  return isStreaming;
}

export function createUserTextMessage(text: string): UserTextMessage {
  return { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
}

export async function handleTuiInput(rawInput: string, options: TuiControllerOptions): Promise<void> {
  const submission = resolveTuiSubmission(rawInput, options.commands);

  if (submission.type === "error") {
    options.dispatch({ type: "system_message", text: submission.message, tone: "error" });
    return;
  }

  if (submission.type === "builtin") {
    handleBuiltinSubmission(submission.name, submission.args, options);
    return;
  }

  if (shouldSteer(options.agent.state.isStreaming)) {
    const message = createUserTextMessage(submission.prompt);
    options.agent.steer(message);
    options.dispatch({ type: "steer_queued", text: submission.prompt });
    return;
  }

  try {
    await options.agent.prompt(submission.prompt);
    await options.afterTurn?.();
  } catch (error) {
    options.dispatch({
      type: "system_message",
      text: error instanceof Error ? error.message : String(error),
      tone: "error",
    });
  }
}

export async function runTuiConversation(options: RunTuiConversationOptions): Promise<void> {
  const instance = render(<RuntimeApp {...options} />, {
    stdout: options.output as NodeJS.WriteStream,
  });

  await instance.waitUntilExit();
}

function RuntimeApp(options: RunTuiConversationOptions) {
  const { exit } = useApp();
  const [viewState, setViewState] = useState<TuiViewState>(() => createInitialTuiViewState());
  const commands = useMemo(() => buildTuiCommands(options.slashCommands), [options.slashCommands]);

  const dispatch = useCallback((action: TuiViewAction) => {
    setViewState((current) => reduceTuiViewState(current, action));
  }, []);

  const clear = useCallback(() => {
    options.output.write("\u001Bc");
    dispatch({ type: "clear_rows" });
  }, [dispatch, options.output]);

  const controllerOptions = useMemo<TuiControllerOptions>(
    () => ({
      agent: options.agent,
      commands,
      dispatch,
      helpText: options.helpText,
      sessionText: options.sessionText,
      clear,
      exit,
      afterTurn: options.afterTurn,
    }),
    [clear, commands, dispatch, exit, options.afterTurn, options.agent, options.helpText, options.sessionText],
  );

  useEffect(() => {
    return options.agent.subscribe((event) => {
      dispatch(event);
    });
  }, [dispatch, options.agent]);

  useEffect(() => {
    if (!options.firstPrompt) {
      return;
    }

    void handleTuiInput(options.firstPrompt, controllerOptions);
  }, [controllerOptions, options.firstPrompt]);

  const onSubmit = useCallback(
    (text: string) => {
      void handleTuiInput(text, controllerOptions);
    },
    [controllerOptions],
  );

  const onAbort = useCallback(() => {
    options.agent.abort();
  }, [options.agent]);

  const onToggleToolResults = useCallback(() => {
    dispatch({ type: "toggle_tool_results" });
  }, [dispatch]);

  return (
    <TuiApp
      appVersion={options.appVersion}
      modelLabel={options.modelLabel}
      sessionId={options.sessionId}
      sessionMode={options.sessionMode}
      workspaceRoot={options.workspaceRoot}
      toolCount={options.toolNames.length}
      pluginCount={options.pluginIds.length}
      projectContextCount={options.projectContextFiles.length}
      messageCount={viewState.rows.length}
      commands={commands}
      rows={viewState.rows}
      todos={viewState.latestTodos}
      streaming={viewState.streaming}
      toolResultsExpanded={viewState.toolResultsExpanded}
      onSubmit={onSubmit}
      onAbort={onAbort}
      onToggleToolResults={onToggleToolResults}
    />
  );
}

function handleBuiltinSubmission(name: string, args: string, options: TuiControllerOptions): void {
  if (name === "exit" || name === "quit") {
    options.exit();
    return;
  }

  if (name === "clear") {
    options.clear();
    return;
  }

  if (name === "session") {
    options.dispatch({ type: "system_message", text: options.sessionText(), tone: "info" });
    return;
  }

  if (name === "help") {
    options.dispatch({ type: "system_message", text: formatTuiHelp(options.commands, args || undefined), tone: "info" });
    return;
  }
}
