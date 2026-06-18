export interface TodoViewItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | string;
}

export type AssistantTextSpanStyle = "strong" | "code";

export interface AssistantTextSpan {
  text: string;
  style?: AssistantTextSpanStyle;
}

export type AssistantTextBlock =
  | { kind: "heading"; spans: AssistantTextSpan[] }
  | { kind: "paragraph"; spans: AssistantTextSpan[] }
  | { kind: "listItem"; spans: AssistantTextSpan[] }
  | { kind: "codeBlock"; spans: AssistantTextSpan[] }
  | { kind: "blank" };

export const TOOL_RESULT_PREVIEW_CHARS = 600;
export const TOOL_RESULT_EXPANDED_CHARS = Infinity;

export function summarizeToolTitle(toolName: string): string {
  switch (toolName) {
    case "bash":
      return "Run command";
    case "read_file":
      return "Read file";
    case "write_file":
      return "Write file";
    case "edit_file":
    case "multi_edit_file":
      return "Edit file";
    case "search_files":
      return "Search files";
    case "web_search":
      return "Search web";
    case "web_fetch":
      return "Fetch web page";
    case "todo_write":
      return "Update todos";
    case "todo_read":
      return "Read todos";
    default:
      return `Run ${toolName}`;
  }
}

export function formatToolArgs(toolName: string, args: unknown, maxChars = 240): string {
  const object = isObject(args) ? args : {};
  let text: string;

  switch (toolName) {
    case "bash":
      text = stringValue(object.command);
      break;
    case "read_file":
    case "write_file":
    case "edit_file":
    case "multi_edit_file":
    case "file_info":
      text = stringValue(object.path);
      break;
    case "search_files":
      text = [stringValue(object.path), stringValue(object.query)].filter(Boolean).join(" :: ");
      break;
    case "web_search":
      text = stringValue(object.query);
      break;
    case "web_fetch":
      text = stringValue(object.url);
      break;
    case "todo_write":
      text = "todo list";
      break;
    default:
      text = safeJson(args);
      break;
  }

  return truncate(text || safeJson(args), maxChars);
}

export function formatToolResult(result: unknown, maxChars = TOOL_RESULT_PREVIEW_CHARS): string {
  const todos = extractTodos(result);
  if (todos.length > 0) {
    const completed = todos.filter((todo) => todo.status === "completed").length;
    const inProgress = todos.filter((todo) => todo.status === "in_progress").length;
    const pending = todos.filter((todo) => todo.status === "pending").length;
    return `Todos: ${completed} completed, ${inProgress} in progress, ${pending} pending`;
  }

  if (isObject(result) && Array.isArray(result.content)) {
    const text = result.content
      .flatMap((content) =>
        isObject(content) && content.type === "text" && typeof content.text === "string" ? [content.text] : [],
      )
      .join("\n");
    if (text) {
      return truncate(text, maxChars);
    }
  }

  return truncate(safeJson(result), maxChars);
}

export function extractTodos(result: unknown): TodoViewItem[] {
  if (!isObject(result) || !isObject(result.details) || !Array.isArray(result.details.todos)) {
    return [];
  }

  return result.details.todos.flatMap((todo) => {
    if (!isObject(todo) || typeof todo.content !== "string" || typeof todo.status !== "string") {
      return [];
    }
    return [{ content: todo.content, status: todo.status }];
  });
}

export function formatAssistantTextBlocks(text: string): AssistantTextBlock[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: AssistantTextBlock[] = [];
  let codeLines: string[] | undefined;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (codeLines) {
        blocks.push({ kind: "codeBlock", spans: [{ text: codeLines.join("\n"), style: "code" }] });
        codeLines = undefined;
      } else {
        codeLines = [];
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push({ kind: "blank" });
      continue;
    }

    const markdownHeading = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed);
    if (markdownHeading) {
      blocks.push({ kind: "heading", spans: strongHeadingSpans(markdownHeading[2] ?? "") });
      continue;
    }

    const strongOnlyHeading = /^\*\*(.+?)\*\*$/.exec(trimmed);
    if (strongOnlyHeading) {
      blocks.push({ kind: "heading", spans: [{ text: strongOnlyHeading[1] ?? "", style: "strong" }] });
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      blocks.push({ kind: "listItem", spans: formatInlineSpans(bullet[1] ?? "") });
      continue;
    }

    blocks.push({ kind: "paragraph", spans: formatInlineSpans(line) });
  }

  if (codeLines) {
    blocks.push({ kind: "codeBlock", spans: [{ text: codeLines.join("\n"), style: "code" }] });
  }

  return blocks;
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function strongHeadingSpans(text: string): AssistantTextSpan[] {
  return formatInlineSpans(text).map((span) => (span.style ? span : { ...span, style: "strong" }));
}

function formatInlineSpans(text: string): AssistantTextSpan[] {
  const spans: AssistantTextSpan[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const nextCode = text.indexOf("`", cursor);
    const nextStrong = text.indexOf("**", cursor);
    const tokenStart = firstTokenIndex(nextCode, nextStrong);

    if (tokenStart === -1) {
      appendSpan(spans, { text: text.slice(cursor) });
      break;
    }

    if (tokenStart > cursor) {
      appendSpan(spans, { text: text.slice(cursor, tokenStart) });
    }

    if (tokenStart === nextCode) {
      const tokenEnd = text.indexOf("`", tokenStart + 1);
      if (tokenEnd === -1) {
        appendSpan(spans, { text: text.slice(tokenStart) });
        break;
      }
      appendSpan(spans, { text: text.slice(tokenStart + 1, tokenEnd), style: "code" });
      cursor = tokenEnd + 1;
      continue;
    }

    const tokenEnd = text.indexOf("**", tokenStart + 2);
    if (tokenEnd === -1) {
      appendSpan(spans, { text: text.slice(tokenStart) });
      break;
    }
    appendSpan(spans, { text: text.slice(tokenStart + 2, tokenEnd), style: "strong" });
    cursor = tokenEnd + 2;
  }

  return spans;
}

function firstTokenIndex(left: number, right: number): number {
  if (left === -1) {
    return right;
  }
  if (right === -1) {
    return left;
  }
  return Math.min(left, right);
}

function appendSpan(spans: AssistantTextSpan[], span: AssistantTextSpan): void {
  if (!span.text) {
    return;
  }

  const last = spans[spans.length - 1];
  if (last && last.style === span.style) {
    last.text += span.text;
    return;
  }

  spans.push(span);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
