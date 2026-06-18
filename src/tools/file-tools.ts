import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { Stats } from "node:fs";
import { access, mkdir, open, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isMissingFileError, throwIfAborted } from "../utils/errors.js";
import {
  resolveExistingWorkspacePath,
  resolveWritableWorkspacePath,
  splitDisplayPath,
  toDisplayPath,
} from "./workspace-path.js";

const DEFAULT_MAX_FILES = 200;
const DEFAULT_MAX_MATCHES = 100;
const DEFAULT_MAX_READ_LINES = 200;
const MAX_READ_RECORDS = 128;
const MAX_READ_TEXTS_PER_PATH = 16;
const BINARY_SAMPLE_BYTES = 8192;
const SKIPPED_NAMES = new Set([
  ".git",
  ".next",
  ".pi-sessions.sqlite",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const listFilesParameters = Type.Object({
  path: Type.Optional(Type.String({ description: "Directory or file path relative to the workspace root. Defaults to ." })),
  pattern: Type.Optional(
    Type.String({
      description: "Optional glob pattern to filter returned files, such as **/*.ts.",
    }),
  ),
  max_results: Type.Optional(
    Type.Integer({
      description: "Maximum number of files to return. Defaults to 200.",
      minimum: 1,
      maximum: 1000,
    }),
  ),
});

const searchFilesParameters = Type.Object({
  query: Type.String({ description: "Text to search for in UTF-8 workspace files." }),
  path: Type.Optional(Type.String({ description: "Directory or file path relative to the workspace root. Defaults to ." })),
  regex: Type.Optional(
    Type.Boolean({
      description: "Treat query as a JavaScript regular expression. Defaults to false.",
      default: false,
    }),
  ),
  case_sensitive: Type.Optional(
    Type.Boolean({
      description: "Whether text matching is case-sensitive. Defaults to true.",
      default: true,
    }),
  ),
  context_lines: Type.Optional(
    Type.Integer({
      description: "Number of surrounding lines to include before and after each match. Defaults to 0.",
      minimum: 0,
      maximum: 20,
    }),
  ),
  max_results: Type.Optional(
    Type.Integer({
      description: "Maximum number of matches to return. Defaults to 100.",
      minimum: 1,
      maximum: 1000,
    }),
  ),
});

const readFileParameters = Type.Object({
  path: Type.String({ description: "File path relative to the workspace root." }),
  start_line: Type.Optional(
    Type.Integer({
      description: "1-based line number to start reading from. Defaults to 1.",
      minimum: 1,
    }),
  ),
  max_lines: Type.Optional(
    Type.Integer({
      description: "Maximum number of lines to return. Defaults to 200.",
      minimum: 1,
      maximum: 1000,
    }),
  ),
  show_line_numbers: Type.Optional(
    Type.Boolean({
      description: "Include 1-based line numbers in the displayed output. Defaults to false.",
      default: false,
    }),
  ),
});

const fileInfoParameters = Type.Object({
  path: Type.String({ description: "File or directory path relative to the workspace root." }),
});

const editFileParameters = Type.Object({
  path: Type.String({ description: "File path relative to the workspace root." }),
  old_text: Type.String({ description: "Exact existing text to replace. Must match exactly one location." }),
  new_text: Type.String({ description: "Replacement text." }),
});

const multiEditItemParameters = Type.Object({
  old_text: Type.String({ description: "Exact existing text to replace. Must match exactly one location." }),
  new_text: Type.String({ description: "Replacement text." }),
});

const multiEditFileParameters = Type.Object({
  path: Type.String({ description: "File path relative to the workspace root." }),
  edits: Type.Array(multiEditItemParameters, {
    description: "Ordered exact text replacements to apply atomically after reading the file.",
  }),
});

const writeFileParameters = Type.Object({
  path: Type.String({ description: "File path relative to the workspace root." }),
  content: Type.String({ description: "UTF-8 text content to write." }),
  overwrite: Type.Optional(
    Type.Boolean({
      description: "Set true only after confirming that replacing an existing file is intended.",
      default: false,
    }),
  ),
});

interface ListFilesDetails {
  root: string;
  pattern?: string;
  files: string[];
  truncated: boolean;
}

interface SearchFilesDetails {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  matches: SearchMatch[];
  truncated: boolean;
}

interface SearchMatch {
  path: string;
  line: number;
  text: string;
  contextBefore?: SearchContextLine[];
  contextAfter?: SearchContextLine[];
}

interface SearchContextLine {
  line: number;
  text: string;
}

interface ReadFileDetails {
  path: string;
  bytes: number;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
  showLineNumbers: boolean;
}

interface FileInfoDetails {
  path: string;
  kind: "file" | "directory" | "other";
  modifiedAt: string;
  bytes?: number;
  binary?: boolean;
  entries?: number;
}

interface FileToolDetails {
  path: string;
  bytes: number;
}

interface EditFileDetails {
  path: string;
  replacements: number;
  bytes: number;
}

export function createFileTools(workspaceRoot: string): AgentTool[] {
  const root = resolve(workspaceRoot);
  const readTextByPath = new Map<string, string[]>();
  const readPathOrder: string[] = [];

  const listTool: AgentTool<typeof listFilesParameters, ListFilesDetails> = {
    name: "list_files",
    label: "List Files",
    description:
      "List files in the workspace. Skips common generated directories and runtime files. Use paths relative to the workspace root.",
    parameters: listFilesParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      const requestedPath = params.path ?? ".";
      const target = await resolveExistingWorkspacePath(root, requestedPath);
      const maxResults = params.max_results ?? DEFAULT_MAX_FILES;
      const pattern = params.pattern?.trim();
      const allFiles = await collectWorkspaceFiles(root, target, pattern ? Number.MAX_SAFE_INTEGER : maxResults, signal);
      const matchingFiles = pattern ? allFiles.filter(createGlobMatcher(pattern)) : allFiles;
      const files = matchingFiles.slice(0, maxResults);
      const displayRoot = toDisplayPath(root, target);
      const truncated = matchingFiles.length > maxResults || (!pattern && allFiles.length >= maxResults);

      return {
        content: [{ type: "text", text: formatFileList(displayRoot, files, truncated, pattern) }],
        details: {
          root: displayRoot,
          ...(pattern ? { pattern } : {}),
          files,
          truncated,
        },
      };
    },
  };

  const searchTool: AgentTool<typeof searchFilesParameters, SearchFilesDetails> = {
    name: "search_files",
    label: "Search Files",
    description:
      "Search UTF-8 workspace files and return matching path:line entries. Skips common generated directories and runtime files.",
    parameters: searchFilesParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      const query = params.query;
      if (!query) {
        throw new Error("Search query is required");
      }

      const requestedPath = params.path ?? ".";
      const target = await resolveExistingWorkspacePath(root, requestedPath);
      const maxResults = params.max_results ?? DEFAULT_MAX_MATCHES;
      const contextLines = params.context_lines ?? 0;
      const regex = params.regex ?? false;
      const caseSensitive = params.case_sensitive ?? true;
      const matchesQuery = createSearchMatcher(query, { regex, caseSensitive });
      const files = await collectWorkspaceFiles(root, target, Number.MAX_SAFE_INTEGER, signal);
      const matches: SearchMatch[] = [];

      for (const file of files) {
        throwIfAborted(signal);
        const absolutePath = await resolveExistingWorkspacePath(root, file);
        const text = await readTextFileIfSafe(absolutePath);
        if (text === undefined) {
          continue;
        }

        const lines = splitFileLines(text);
        for (let index = 0; index < lines.length; index += 1) {
          if (!matchesQuery(lines[index])) {
            continue;
          }

          matches.push({
            path: file,
            line: index + 1,
            text: lines[index],
            ...searchContextFor(lines, index, contextLines),
          });

          if (matches.length >= maxResults) {
            return {
              content: [{ type: "text", text: formatSearchResults(query, matches, true) }],
              details: {
                query,
                regex,
                caseSensitive,
                matches,
                truncated: true,
              },
            };
          }
        }
      }

      return {
        content: [{ type: "text", text: formatSearchResults(query, matches, false) }],
        details: {
          query,
          regex,
          caseSensitive,
          matches,
          truncated: false,
        },
      };
    },
  };

  const infoTool: AgentTool<typeof fileInfoParameters, FileInfoDetails> = {
    name: "file_info",
    label: "File Info",
    description: "Return metadata for a workspace file or directory, including size and binary detection for files.",
    parameters: fileInfoParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      const target = await resolveExistingWorkspacePath(root, params.path);
      const info = await statWorkspacePath(root, target);
      const displayPath = toDisplayPath(root, target);
      const baseDetails = {
        path: displayPath,
        kind: fileKind(info),
        modifiedAt: info.mtime.toISOString(),
      };

      if (info.isFile()) {
        const details = {
          ...baseDetails,
          bytes: info.size,
          binary: await isBinaryFile(target, info.size),
        };

        return {
          content: [{ type: "text", text: formatFileInfo(details) }],
          details,
        };
      }

      if (info.isDirectory()) {
        const details = {
          ...baseDetails,
          entries: (await readdir(target)).length,
        };

        return {
          content: [{ type: "text", text: formatFileInfo(details) }],
          details,
        };
      }

      return {
        content: [{ type: "text", text: formatFileInfo(baseDetails) }],
        details: baseDetails,
      };
    },
  };

  const readTool: AgentTool<typeof readFileParameters, ReadFileDetails> = {
    name: "read_file",
    label: "Read File",
    description:
      "Read a UTF-8 text file from the workspace. Returns up to 200 lines by default; use start_line and max_lines to page through large files.",
    parameters: readFileParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      const target = await resolveExistingWorkspacePath(root, params.path);
      const targetInfo = await statWorkspacePath(root, target);
      if (targetInfo.isDirectory()) {
        throw new Error("Cannot read directory with read_file; use list_files or file_info instead");
      }
      if (targetInfo.isFile() && (await isBinaryFile(target, targetInfo.size))) {
        throw new Error("Cannot read binary file with read_file; use file_info to inspect metadata instead");
      }

      const text = await readFile(target, "utf8");
      const displayPath = toDisplayPath(root, target);
      const readResult = formatReadFileResult(text, {
        startLine: params.start_line ?? 1,
        maxLines: params.max_lines ?? DEFAULT_MAX_READ_LINES,
        showLineNumbers: params.show_line_numbers ?? false,
      });
      rememberReadText(readTextByPath, readPathOrder, target, readResult.text);

      return {
        content: [{ type: "text", text: readResult.text }],
        details: {
          path: displayPath,
          bytes: Buffer.byteLength(text, "utf8"),
          startLine: readResult.startLine,
          endLine: readResult.endLine,
          totalLines: readResult.totalLines,
          truncated: readResult.truncated,
          showLineNumbers: readResult.showLineNumbers,
        },
      };
    },
  };

  const editTool: AgentTool<typeof editFileParameters, EditFileDetails> = {
    name: "edit_file",
    label: "Edit File",
    description:
      "Replace exactly one text occurrence in a workspace file after reading it with read_file. Use this for small, precise edits instead of rewriting whole files.",
    parameters: editFileParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      if (!params.old_text) {
        throw new Error("old_text is required");
      }

      const target = await resolveExistingWorkspacePath(root, params.path);
      const readTexts = readTextByPath.get(target);
      if (!readTexts) {
        throw new Error("Read the file with read_file before editing it");
      }

      const text = await readFile(target, "utf8");
      const matches = countOccurrences(text, params.old_text);
      if (matches !== 1) {
        throw new Error(`old_text must match exactly one location; found ${matches}`);
      }
      if (!readTexts.some((readText) => readText.includes(params.old_text))) {
        throw new Error("old_text must appear in text returned by read_file before editing it");
      }

      const nextText = text.replace(params.old_text, params.new_text);
      await writeFile(target, nextText, "utf8");

      const displayPath = toDisplayPath(root, target);
      return {
        content: [{ type: "text", text: `Edited ${displayPath} (1 replacement)` }],
        details: {
          path: displayPath,
          replacements: 1,
          bytes: Buffer.byteLength(nextText, "utf8"),
        },
      };
    },
  };

  const multiEditTool: AgentTool<typeof multiEditFileParameters, EditFileDetails> = {
    name: "multi_edit_file",
    label: "Multi Edit File",
    description:
      "Apply multiple exact text replacements in a workspace file after reading it with read_file. The file is written only if every replacement is valid.",
    parameters: multiEditFileParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      if (params.edits.length === 0) {
        throw new Error("At least one edit is required");
      }

      const target = await resolveExistingWorkspacePath(root, params.path);
      const readTexts = readTextByPath.get(target);
      if (!readTexts) {
        throw new Error("Read the file with read_file before editing it");
      }

      const text = await readFile(target, "utf8");
      let nextText = text;

      for (let index = 0; index < params.edits.length; index += 1) {
        const edit = params.edits[index];
        const editNumber = index + 1;
        if (!edit.old_text) {
          throw new Error(`old_text for edit ${editNumber} is required`);
        }

        const matches = countOccurrences(nextText, edit.old_text);
        if (matches !== 1) {
          throw new Error(`old_text for edit ${editNumber} must match exactly one location; found ${matches}`);
        }
        if (!readTexts.some((readText) => readText.includes(edit.old_text))) {
          throw new Error(`old_text for edit ${editNumber} must appear in text returned by read_file before editing it`);
        }

        nextText = nextText.replace(edit.old_text, edit.new_text);
      }

      await writeFile(target, nextText, "utf8");

      const displayPath = toDisplayPath(root, target);
      const replacementCount = params.edits.length;
      return {
        content: [
          {
            type: "text",
            text: `Edited ${displayPath} (${replacementCount} ${replacementCount === 1 ? "replacement" : "replacements"})`,
          },
        ],
        details: {
          path: displayPath,
          replacements: replacementCount,
          bytes: Buffer.byteLength(nextText, "utf8"),
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

      const target = await resolveWritableWorkspacePath(root, params.path);
      const fileExists = await pathExists(target);
      if (fileExists && params.overwrite !== true) {
        throw new Error("File already exists; pass overwrite: true after confirming replacement is intended");
      }
      if (fileExists && !readTextByPath.has(target)) {
        throw new Error("Read the file with read_file before overwriting it");
      }

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

  return [infoTool, listTool, searchTool, readTool, editTool, multiEditTool, writeTool];
}

function rememberReadText(readTextByPath: Map<string, string[]>, readPathOrder: string[], target: string, text: string) {
  const existingTexts = readTextByPath.get(target) ?? [];
  const existingIndex = readPathOrder.indexOf(target);
  if (existingIndex !== -1) {
    readPathOrder.splice(existingIndex, 1);
  }

  readTextByPath.set(target, [...existingTexts, text].slice(-MAX_READ_TEXTS_PER_PATH));
  readPathOrder.push(target);

  while (readPathOrder.length > MAX_READ_RECORDS) {
    const expiredPath = readPathOrder.shift();
    if (expiredPath) {
      readTextByPath.delete(expiredPath);
    }
  }
}

async function collectWorkspaceFiles(
  root: string,
  target: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const files: string[] = [];
  const targetStat = await statWorkspacePath(root, target);

  if (targetStat.isFile()) {
    if (!shouldSkipPath(root, target)) {
      files.push(toDisplayPath(root, target));
    }
    return files;
  }

  if (!targetStat.isDirectory()) {
    return files;
  }

  await collectDirectoryFiles(root, target, files, maxResults, signal);
  files.sort();
  return files;
}

async function collectDirectoryFiles(
  root: string,
  directory: string,
  files: string[],
  maxResults: number,
  signal?: AbortSignal,
): Promise<void> {
  if (files.length >= maxResults) {
    return;
  }

  throwIfAborted(signal);

  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (files.length >= maxResults) {
      return;
    }
    if (shouldSkipName(entry.name)) {
      continue;
    }

    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectDirectoryFiles(root, absolutePath, files, maxResults, signal);
      continue;
    }

    if (entry.isFile() && !shouldSkipPath(root, absolutePath)) {
      files.push(toDisplayPath(root, absolutePath));
    }
  }
}

async function readTextFileIfSafe(path: string): Promise<string | undefined> {
  const buffer = await readFile(path);
  if (buffer.includes(0)) {
    return undefined;
  }

  return buffer.toString("utf8");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

async function statWorkspacePath(root: string, target: string): Promise<Stats> {
  try {
    return await stat(target);
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new Error(`Path not found: ${toDisplayPath(root, target)}`);
    }

    throw error;
  }
}

function formatFileList(root: string, files: string[], truncated: boolean, pattern?: string): string {
  const lines = [pattern ? `Files under ${root} matching ${pattern}:` : `Files under ${root}:`];
  lines.push(...files);
  if (files.length === 0) {
    lines.push("No files found.");
  }
  if (truncated) {
    lines.push("Results truncated.");
  }

  return lines.join("\n");
}

function formatFileInfo(details: FileInfoDetails): string {
  const lines = [`File info for ${details.path}:`, `kind: ${details.kind}`];

  if (details.bytes !== undefined) {
    lines.push(`bytes: ${details.bytes}`);
  }
  if (details.binary !== undefined) {
    lines.push(`binary: ${details.binary}`);
  }
  if (details.entries !== undefined) {
    lines.push(`entries: ${details.entries}`);
  }

  lines.push(`modified: ${details.modifiedAt}`);
  return lines.join("\n");
}

function fileKind(info: Stats): FileInfoDetails["kind"] {
  if (info.isFile()) {
    return "file";
  }
  if (info.isDirectory()) {
    return "directory";
  }

  return "other";
}

async function isBinaryFile(path: string, size: number): Promise<boolean> {
  if (size === 0) {
    return false;
  }

  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(Math.min(size, BINARY_SAMPLE_BYTES));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await file.close();
  }
}

function createGlobMatcher(pattern: string): (path: string) => boolean {
  if (!pattern) {
    throw new Error("Glob pattern is required");
  }

  const normalizedPattern = normalizePathForGlob(pattern);
  const regex = new RegExp(`^${globToRegExpSource(normalizedPattern)}$`);
  return (path) => regex.test(normalizePathForGlob(path));
}

function globToRegExpSource(pattern: string): string {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        if (pattern[index + 2] === "/") {
          source += "(?:.*/)?";
          index += 2;
          continue;
        }

        source += ".*";
        index += 1;
        continue;
      }

      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(char);
  }

  return source;
}

function normalizePathForGlob(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

function formatSearchResults(query: string, matches: SearchMatch[], truncated: boolean): string {
  const lines = [`Search results for "${query}":`];
  if (matches.length === 0) {
    lines.push("No matches found.");
  }
  for (const match of matches) {
    for (const contextLine of match.contextBefore ?? []) {
      lines.push(`${match.path}:${contextLine.line}: ${contextLine.text}`);
    }
    lines.push(`${match.path}:${match.line}: ${match.text}`);
    for (const contextLine of match.contextAfter ?? []) {
      lines.push(`${match.path}:${contextLine.line}: ${contextLine.text}`);
    }
  }
  if (truncated) {
    lines.push("Results truncated.");
  }

  return lines.join("\n");
}

function createSearchMatcher(
  query: string,
  options: { regex: boolean; caseSensitive: boolean },
): (line: string) => boolean {
  if (!options.regex) {
    const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
    return (line) => (options.caseSensitive ? line : line.toLocaleLowerCase()).includes(needle);
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(query, options.caseSensitive ? "" : "i");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid search regex: ${message}`);
  }

  return (line) => pattern.test(line);
}

function searchContextFor(lines: string[], matchIndex: number, contextLines: number): Partial<SearchMatch> {
  if (contextLines <= 0) {
    return {};
  }

  const beforeStart = Math.max(0, matchIndex - contextLines);
  const afterEnd = Math.min(lines.length, matchIndex + 1 + contextLines);

  return {
    contextBefore: lines.slice(beforeStart, matchIndex).map((text, offset) => ({
      line: beforeStart + offset + 1,
      text,
    })),
    contextAfter: lines.slice(matchIndex + 1, afterEnd).map((text, offset) => ({
      line: matchIndex + offset + 2,
      text,
    })),
  };
}

function formatReadFileResult(
  text: string,
  options: { startLine: number; maxLines: number; showLineNumbers: boolean },
): {
  text: string;
  visibleText: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
  showLineNumbers: boolean;
} {
  if (options.startLine < 1) {
    throw new Error("start_line must be at least 1");
  }
  if (options.maxLines < 1) {
    throw new Error("max_lines must be at least 1");
  }

  const lines = splitFileLines(text);
  const totalLines = lines.length;
  const startIndex = Math.min(options.startLine - 1, totalLines);
  const endIndex = Math.min(startIndex + options.maxLines, totalLines);
  const visibleLines = lines.slice(startIndex, endIndex);
  const truncated = options.startLine > 1 || endIndex < totalLines;
  const startLine = visibleLines.length ? startIndex + 1 : options.startLine;
  const endLine = visibleLines.length ? endIndex : startLine - 1;
  const body = visibleLines.join("\n");
  const displayBody = options.showLineNumbers ? formatNumberedLines(visibleLines, startLine) : body;

  if (!truncated) {
    return {
      text: displayBody,
      visibleText: text,
      startLine,
      endLine,
      totalLines,
      truncated,
      showLineNumbers: options.showLineNumbers,
    };
  }

  const notice = `[File truncated: showing lines ${startLine}-${endLine} of ${totalLines}. Use start_line and max_lines to read more.]`;
  return {
    text: displayBody ? `${displayBody}\n${notice}` : notice,
    visibleText: body,
    startLine,
    endLine,
    totalLines,
    truncated,
    showLineNumbers: options.showLineNumbers,
  };
}

function formatNumberedLines(lines: string[], startLine: number): string {
  return lines.map((line, index) => `${startLine + index} | ${line}`).join("\n");
}

function splitFileLines(text: string): string[] {
  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  if (text.endsWith("\n")) {
    lines.pop();
  }

  return lines;
}

function countOccurrences(text: string, searchText: string): number {
  let count = 0;
  let index = text.indexOf(searchText);

  while (index !== -1) {
    count += 1;
    index = text.indexOf(searchText, index + searchText.length);
  }

  return count;
}

function shouldSkipPath(root: string, target: string): boolean {
  return splitDisplayPath(toDisplayPath(root, target)).some((part) => shouldSkipName(part));
}

function shouldSkipName(name: string): boolean {
  return SKIPPED_NAMES.has(name);
}
