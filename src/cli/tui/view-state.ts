import {
  extractTodos,
  formatToolArgs,
  formatToolResult,
  summarizeToolTitle,
  type TodoViewItem,
} from "./message-format.js";

export type TuiRow =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; error?: boolean }
  | {
      kind: "tool";
      toolCallId: string;
      toolName: string;
      title: string;
      detail: string;
      result?: string;
      status: "running" | "ok" | "error";
    }
  | { kind: "steering"; text: string }
  | { kind: "system"; text: string; tone?: "info" | "error" };

export interface TuiViewState {
  streaming: boolean;
  rows: TuiRow[];
  latestTodos: TodoViewItem[];
}

export type TuiViewAction =
  | { type: "agent_start" }
  | { type: "agent_end"; messages?: unknown[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message?: unknown; toolResults?: unknown[] }
  | { type: "message_start"; message: unknown }
  | { type: "message_update"; message?: unknown; assistantMessageEvent: unknown }
  | { type: "message_end"; message: unknown }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args?: unknown; partialResult: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "steer_queued"; text: string }
  | { type: "system_message"; text: string; tone?: "info" | "error" };

export function createInitialTuiViewState(): TuiViewState {
  return {
    streaming: false,
    rows: [],
    latestTodos: [],
  };
}

export function reduceTuiViewState(state: TuiViewState, action: TuiViewAction): TuiViewState {
  switch (action.type) {
    case "agent_start":
      return { ...state, streaming: true };
    case "agent_end":
      return { ...state, streaming: false };
    case "message_start":
      return handleMessageStart(state, action.message);
    case "message_update":
      return handleMessageUpdate(state, action.assistantMessageEvent);
    case "message_end":
      return handleMessageEnd(state, action.message);
    case "tool_execution_start":
      return appendRow(state, {
        kind: "tool",
        toolCallId: action.toolCallId,
        toolName: action.toolName,
        title: summarizeToolTitle(action.toolName),
        detail: formatToolArgs(action.toolName, action.args),
        status: "running",
      });
    case "tool_execution_update":
      return updateToolRow(state, action.toolCallId, { result: formatToolResult(action.partialResult) });
    case "tool_execution_end": {
      const todos = extractTodos(action.result);
      const nextState = updateToolRow(state, action.toolCallId, {
        status: action.isError ? "error" : "ok",
        result: formatToolResult(action.result),
      });
      return todos.length ? { ...nextState, latestTodos: todos } : nextState;
    }
    case "steer_queued":
      return appendRow(state, { kind: "steering", text: action.text });
    case "system_message":
      return appendRow(state, { kind: "system", text: action.text, tone: action.tone });
    default:
      return state;
  }
}

export function selectLatestTodos(state: TuiViewState): TodoViewItem[] {
  return state.latestTodos;
}

function handleMessageStart(state: TuiViewState, message: unknown): TuiViewState {
  if (!isObject(message)) {
    return state;
  }

  if (message.role === "user") {
    return appendRow(state, { kind: "user", text: textFromMessage(message) });
  }

  if (message.role === "assistant" && state.rows[state.rows.length - 1]?.kind !== "assistant") {
    return appendRow(state, { kind: "assistant", text: "" });
  }

  return state;
}

function handleMessageUpdate(state: TuiViewState, event: unknown): TuiViewState {
  if (!isObject(event) || event.type !== "text_delta" || typeof event.delta !== "string") {
    return state;
  }

  const rows = [...state.rows];
  const last = rows[rows.length - 1];
  if (last?.kind === "assistant") {
    rows[rows.length - 1] = { ...last, text: last.text + event.delta };
  } else {
    rows.push({ kind: "assistant", text: event.delta });
  }

  return { ...state, rows };
}

function handleMessageEnd(state: TuiViewState, message: unknown): TuiViewState {
  if (!isObject(message) || message.role !== "assistant") {
    return state;
  }

  if (
    (message.stopReason === "error" || message.stopReason === "aborted") &&
    typeof message.errorMessage === "string"
  ) {
    return appendRow(state, { kind: "assistant", text: message.errorMessage, error: true });
  }

  return state;
}

function updateToolRow(
  state: TuiViewState,
  toolCallId: string,
  patch: Partial<Extract<TuiRow, { kind: "tool" }>>,
): TuiViewState {
  return {
    ...state,
    rows: state.rows.map((row) => (row.kind === "tool" && row.toolCallId === toolCallId ? { ...row, ...patch } : row)),
  };
}

function appendRow(state: TuiViewState, row: TuiRow): TuiViewState {
  return { ...state, rows: [...state.rows, row] };
}

function textFromMessage(message: Record<string, unknown>): string {
  if (!Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .flatMap((content) =>
      isObject(content) && content.type === "text" && typeof content.text === "string" ? [content.text] : [],
    )
    .join("\n");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
