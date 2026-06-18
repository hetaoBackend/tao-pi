export interface TodoViewItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | string;
}

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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
