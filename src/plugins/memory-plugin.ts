import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentPlugin } from "./plugin-registry.js";

const MEMORY_INDEX_MAX_CHARS = 12000;

export interface CreateMemoryPluginOptions {
  memoryDir: string;
}

export function createMemoryPlugin(options: CreateMemoryPluginOptions): AgentPlugin {
  const memoryIndex = loadMemoryIndex(options.memoryDir);
  const systemPromptSections = [
    `- memory: persistent file-based memories live in ${options.memoryDir}. Use existing file tools to inspect or edit MEMORY.md and related memory files. Save only durable user preferences, feedback, project constraints, and external references that are not already obvious from the repository or git history; update or delete stale memories instead of duplicating them.`,
  ];

  if (memoryIndex) {
    systemPromptSections.push(["Current memory index:", memoryIndex].join("\n"));
  }

  return {
    id: "memory",
    systemPromptSections,
  };
}

function loadMemoryIndex(memoryDir: string): string | undefined {
  try {
    const content = readFileSync(join(memoryDir, "MEMORY.md"), "utf8").trim();
    if (!content) {
      return undefined;
    }
    if (content.length <= MEMORY_INDEX_MAX_CHARS) {
      return content;
    }

    return `${content.slice(0, MEMORY_INDEX_MAX_CHARS)}\n[Memory index truncated]`;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
