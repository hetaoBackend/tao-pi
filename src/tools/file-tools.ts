import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const readFileParameters = Type.Object({
  path: Type.String({ description: "File path relative to the workspace root." }),
});

const writeFileParameters = Type.Object({
  path: Type.String({ description: "File path relative to the workspace root." }),
  content: Type.String({ description: "UTF-8 text content to write." }),
});

interface FileToolDetails {
  path: string;
  bytes: number;
}

export function createFileTools(workspaceRoot: string): AgentTool[] {
  const root = resolve(workspaceRoot);

  const readTool: AgentTool<typeof readFileParameters, FileToolDetails> = {
    name: "read_file",
    label: "Read File",
    description: "Read a UTF-8 text file from the workspace. Use a path relative to the workspace root.",
    parameters: readFileParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      const target = resolveWorkspacePath(root, params.path);
      const text = await readFile(target, "utf8");
      const displayPath = toDisplayPath(root, target);

      return {
        content: [{ type: "text", text }],
        details: {
          path: displayPath,
          bytes: Buffer.byteLength(text, "utf8"),
        },
      };
    },
  };

  const writeTool: AgentTool<typeof writeFileParameters, FileToolDetails> = {
    name: "write_file",
    label: "Write File",
    description: "Write UTF-8 text to a workspace file. Parent directories are created when needed.",
    parameters: writeFileParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      const target = resolveWorkspacePath(root, params.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, params.content, "utf8");

      const displayPath = toDisplayPath(root, target);
      const bytes = Buffer.byteLength(params.content, "utf8");

      return {
        content: [{ type: "text", text: `Wrote ${bytes} bytes to ${displayPath}` }],
        details: {
          path: displayPath,
          bytes,
        },
      };
    },
  };

  return [readTool, writeTool];
}

function resolveWorkspacePath(root: string, requestedPath: string): string {
  if (!requestedPath.trim()) {
    throw new Error("Path is required");
  }

  const target = resolve(root, requestedPath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error("Path must stay inside the workspace");
  }

  return target;
}

function toDisplayPath(root: string, target: string): string {
  return relative(root, target) || ".";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Tool execution aborted");
  }
}
