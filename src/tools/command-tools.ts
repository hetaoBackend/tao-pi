import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { isNodeError, throwIfAborted } from "../utils/errors.js";
import { resolveExistingWorkspacePath, toDisplayPath } from "./workspace-path.js";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_OUTPUT_CHARS = 20000;

const bashParameters = Type.Object({
  command: Type.String({ description: "Bash command to run inside the workspace." }),
  cwd: Type.Optional(Type.String({ description: "Working directory relative to the workspace root. Defaults to ." })),
  allow_unsafe: Type.Optional(
    Type.Boolean({
      description: "Set true only after user confirmation for commands that delete, reset, overwrite, or execute remote scripts.",
      default: false,
    }),
  ),
  timeout_ms: Type.Optional(
    Type.Integer({
      description: "Maximum runtime in milliseconds. Defaults to 30000.",
      minimum: 1,
      maximum: 600000,
    }),
  ),
  max_output_chars: Type.Optional(
    Type.Integer({
      description: "Maximum characters to retain from each of stdout and stderr. Defaults to 20000.",
      minimum: 1,
      maximum: 200000,
    }),
  ),
});

export interface CommandResultDetails {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutChars: number;
  stderrChars: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
  timeoutMs: number;
  maxOutputChars: number;
  gitOptionalLocksDisabled: boolean;
}

export function createCommandTools(workspaceRoot: string): AgentTool[] {
  const root = resolve(workspaceRoot);

  const runTool: AgentTool<typeof bashParameters, CommandResultDetails> = {
    name: "bash",
    label: "Bash",
    description:
      "Run a Bash command from inside the workspace and return exit code, stdout, stderr, and timeout status. Long stdout/stderr are truncated.",
    parameters: bashParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      const command = params.command.trim();
      if (!command) {
        throw new Error("Command is required");
      }

      const unsafeReason = detectUnsafeCommand(command);
      if (unsafeReason && params.allow_unsafe !== true) {
        throw new Error(`Command looks unsafe ("${unsafeReason}"). Pass allow_unsafe: true only after user confirmation.`);
      }

      const cwd = await resolveWorkspaceDirectory(root, params.cwd ?? ".");
      const timeoutMs = params.timeout_ms ?? DEFAULT_TIMEOUT_MS;
      const maxOutputChars = params.max_output_chars ?? DEFAULT_MAX_OUTPUT_CHARS;
      const gitOptionalLocksDisabled = isReadOnlyGitCommand(command);
      const result = await runBashCommand({
        command,
        cwd,
        timeoutMs,
        maxOutputChars,
        gitOptionalLocksDisabled,
        signal,
      });

      return {
        content: [{ type: "text", text: formatCommandResult(result, timeoutMs) }],
        details: {
          command,
          cwd: toDisplayPath(root, cwd),
          ...result,
          timeoutMs,
          maxOutputChars,
          gitOptionalLocksDisabled,
        },
      };
    },
  };

  return [runTool];
}

function detectUnsafeCommand(command: string): string | undefined {
  if (/(^|[;&|()\s])rm(\s|$)/.test(command)) {
    return "rm";
  }
  if (/(^|[;&|()\s])git\s+reset\s+--hard(\s|$)/.test(command)) {
    return "git reset --hard";
  }
  if (/(^|[;&|()\s])git\s+clean(\s|$)/.test(command)) {
    return "git clean";
  }
  if (/(^|[;&|()\s])git\s+push(\s|$)/.test(command)) {
    return "git push";
  }
  if (/(^|[;&|()\s])chmod\s+(-\S*R\S*|-R)(\s|$)/.test(command)) {
    return "chmod -R";
  }
  if (/(^|[;&|()\s])chown\s+(-\S*R\S*|-R)(\s|$)/.test(command)) {
    return "chown -R";
  }
  if (/\b(curl|wget)\b[\s\S]*\|[\s\S]*\b(sh|bash|zsh)\b/.test(command)) {
    return "remote script pipe";
  }

  return undefined;
}

function runBashCommand(params: {
  command: string;
  cwd: string;
  timeoutMs: number;
  maxOutputChars: number;
  gitOptionalLocksDisabled: boolean;
  signal?: AbortSignal;
}): Promise<
  Pick<
    CommandResultDetails,
    | "exitCode"
    | "stdout"
    | "stderr"
    | "stdoutChars"
    | "stderrChars"
    | "stdoutTruncated"
    | "stderrTruncated"
    | "timedOut"
  >
> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("bash", ["-lc", params.command], {
      cwd: params.cwd,
      env: params.gitOptionalLocksDisabled ? { ...process.env, GIT_OPTIONAL_LOCKS: "0" } : process.env,
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let stdoutChars = 0;
    let stderrChars = 0;
    let timedOut = false;
    let settled = false;
    let forceKillTimeout: NodeJS.Timeout | undefined;

    const settle = (
      result: Pick<
        CommandResultDetails,
        | "exitCode"
        | "stdout"
        | "stderr"
        | "stdoutChars"
        | "stderrChars"
        | "stdoutTruncated"
        | "stderrTruncated"
        | "timedOut"
      >,
    ) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
      }
      params.signal?.removeEventListener("abort", abort);
      resolvePromise(result);
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
      }
      params.signal?.removeEventListener("abort", abort);
      reject(error);
    };

    const abort = () => {
      killChildProcessGroup(child.pid, "SIGTERM");
      fail(new Error("Tool execution aborted"));
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      killChildProcessGroup(child.pid, "SIGTERM");
      forceKillTimeout = setTimeout(() => {
        killChildProcessGroup(child.pid, "SIGKILL");
      }, 100);
      forceKillTimeout.unref?.();
    }, params.timeoutMs);

    params.signal?.addEventListener("abort", abort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutChars += text.length;
      stdout += retainOutputPrefix(stdout, text, params.maxOutputChars);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrChars += text.length;
      stderr += retainOutputPrefix(stderr, text, params.maxOutputChars);
    });

    child.on("error", fail);

    child.on("close", (code) => {
      settle({
        exitCode: timedOut ? null : code,
        stdout,
        stderr,
        stdoutChars,
        stderrChars,
        stdoutTruncated: stdoutChars > params.maxOutputChars,
        stderrTruncated: stderrChars > params.maxOutputChars,
        timedOut,
      });
    });
  });
}

function killChildProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) {
    return;
  }

  try {
    process.kill(process.platform === "win32" ? pid : -pid, signal);
  } catch (error) {
    if (!isMissingProcessError(error)) {
      try {
        process.kill(pid, signal);
      } catch (fallbackError) {
        if (!isMissingProcessError(fallbackError)) {
          throw fallbackError;
        }
      }
    }
  }
}

function formatCommandResult(
  result: Pick<
    CommandResultDetails,
    "exitCode" | "stdout" | "stderr" | "stdoutChars" | "stderrChars" | "stdoutTruncated" | "stderrTruncated" | "timedOut"
  >,
  timeoutMs: number,
): string {
  if (result.timedOut) {
    return `Command timed out after ${timeoutMs}ms`;
  }

  const lines = [`Exit code: ${result.exitCode ?? "unknown"}`];
  if (result.stdout) {
    lines.push("stdout:", result.stdout);
    if (result.stdoutTruncated) {
      lines.push(formatTruncationNotice("stdout", result.stdout.length, result.stdoutChars));
    }
  }
  if (result.stderr) {
    lines.push("stderr:", result.stderr);
    if (result.stderrTruncated) {
      lines.push(formatTruncationNotice("stderr", result.stderr.length, result.stderrChars));
    }
  }

  return lines.join("\n");
}

function retainOutputPrefix(current: string, next: string, maxChars: number): string {
  const remainingChars = maxChars - current.length;
  if (remainingChars <= 0) {
    return "";
  }

  return next.slice(0, remainingChars);
}

function formatTruncationNotice(streamName: "stdout" | "stderr", retainedChars: number, totalChars: number): string {
  return `[${streamName} truncated: showing first ${retainedChars} of ${totalChars} characters. Use max_output_chars or narrow the command output.]`;
}

function isReadOnlyGitCommand(command: string): boolean {
  const normalizedCommand = command.trim();
  const match = /^git\s+([^\s;&|]+)/.exec(normalizedCommand);
  if (!match) {
    return false;
  }

  const subcommand = match[1];
  return READ_ONLY_GIT_SUBCOMMANDS.has(subcommand);
}

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  "--version",
  "blame",
  "branch",
  "diff",
  "grep",
  "log",
  "ls-files",
  "remote",
  "rev-parse",
  "show",
  "status",
]);

async function resolveWorkspaceDirectory(root: string, requestedPath: string): Promise<string> {
  let target: string;
  try {
    target = await resolveExistingWorkspacePath(root, requestedPath);
  } catch (error) {
    if (error instanceof Error && error.message === "Path must stay inside the workspace") {
      throw error;
    }
    throw new Error(`cwd must be an existing directory: ${requestedPath}`);
  }

  try {
    const info = await stat(target);
    if (!info.isDirectory()) {
      throw new Error(`cwd must be an existing directory: ${toDisplayPath(root, target)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("cwd must be an existing directory:")) {
      throw error;
    }
    throw new Error(`cwd must be an existing directory: ${toDisplayPath(root, target)}`);
  }

  return target;
}

function isMissingProcessError(error: unknown): boolean {
  return isNodeError(error) && error.code === "ESRCH";
}
