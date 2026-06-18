import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isMissingFileError } from "../utils/errors.js";

const DEFAULT_CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"];
const DEFAULT_MAX_CHARS_PER_FILE = 12000;

export interface ProjectContextEntry {
  path: string;
  content: string;
  truncated: boolean;
}

export interface LoadProjectContextOptions {
  workspaceRoot: string;
  fileNames?: string[];
  maxCharsPerFile?: number;
}

export async function loadProjectContext(options: LoadProjectContextOptions): Promise<ProjectContextEntry[]> {
  const fileNames = options.fileNames ?? DEFAULT_CONTEXT_FILES;
  const maxCharsPerFile = options.maxCharsPerFile ?? DEFAULT_MAX_CHARS_PER_FILE;
  const entries: ProjectContextEntry[] = [];

  for (const fileName of fileNames) {
    const content = await readOptionalUtf8File(join(options.workspaceRoot, fileName));
    if (content === undefined) {
      continue;
    }

    const truncated = content.length > maxCharsPerFile;
    entries.push({
      path: fileName,
      content: truncated ? content.slice(0, maxCharsPerFile) : content,
      truncated,
    });
  }

  return entries;
}

export function formatProjectContext(entries: ProjectContextEntry[]): string {
  const lines = [
    "## Project Context",
    "The following content comes from project instruction files in the workspace. Current user messages have higher priority; if these files conflict with the current user request, follow the current user request.",
  ];

  for (const entry of entries) {
    lines.push("", `### ${entry.path}`, entry.content.trimEnd());
    if (entry.truncated) {
      lines.push("[Content truncated]");
    }
  }

  return lines.join("\n");
}

async function readOptionalUtf8File(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}
