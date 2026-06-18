import {
  extractTodos,
  formatToolArgs,
  formatToolResult,
  summarizeToolTitle,
  TOOL_RESULT_EXPANDED_CHARS,
  TOOL_RESULT_PREVIEW_CHARS,
  type TodoViewItem,
} from "./message-format.js";

export interface TuiMessageLike {
  role?: unknown;
  content?: unknown;
  stopReason?: unknown;
  errorMessage?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  details?: unknown;
  isError?: unknown;
  timestamp?: unknown;
}

interface TuiAssistantMessageEventLike {
  type?: unknown;
  delta?: unknown;
}

interface TuiToolResultLike {
  content?: unknown;
  details?: unknown;
  terminate?: boolean;
}

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
      fullResult?: string;
      resultTruncated?: boolean;
      resultExpanded?: boolean;
      status: "running" | "ok" | "error";
    }
  | { kind: "steering"; text: string }
  | { kind: "system"; text: string; tone?: "info" | "error" };

export interface TuiViewState {
  streaming: boolean;
  toolResultsExpanded: boolean;
  rows: TuiRow[];
  latestTodos: TodoViewItem[];
  nextUserMessageDisplayText?: string;
}

export type TuiViewAction =
  | { type: "agent_start" }
  | { type: "agent_end"; messages?: TuiMessageLike[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message?: TuiMessageLike; toolResults?: TuiMessageLike[] }
  | { type: "message_start"; message: TuiMessageLike }
  | { type: "message_update"; message?: TuiMessageLike; assistantMessageEvent: TuiAssistantMessageEventLike }
  | { type: "message_end"; message: TuiMessageLike }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args?: unknown; partialResult: TuiToolResultLike }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: TuiToolResultLike; isError: boolean }
  | { type: "toggle_tool_results" }
  | { type: "toggle_tool_result"; toolCallId: string }
  | { type: "toggle_tool_result_at_index"; index: number }
  | { type: "steer_queued"; text: string }
  | { type: "next_user_message_display"; text: string }
  | { type: "clear_next_user_message_display" }
  | { type: "clear_rows" }
  | { type: "system_message"; text: string; tone?: "info" | "error" };

export function createInitialTuiViewState(messages: readonly TuiMessageLike[] = []): TuiViewState {
  return {
    streaming: false,
    toolResultsExpanded: false,
    rows: messages.flatMap(rowFromResumedMessage),
    latestTodos: messages.reduce<TodoViewItem[]>((latestTodos, message) => {
      const todos = extractTodos(message);
      return todos.length ? todos : latestTodos;
    }, []),
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
      return updateToolRow(state, action.toolCallId, formatToolResultView(action.partialResult));
    case "tool_execution_end": {
      const todos = extractTodos(action.result);
      const nextState = updateToolRow(state, action.toolCallId, {
        status: action.isError ? "error" : "ok",
        ...formatToolResultView(action.result),
      });
      return todos.length ? { ...nextState, latestTodos: todos } : nextState;
    }
    case "toggle_tool_results":
      return { ...state, toolResultsExpanded: !state.toolResultsExpanded };
    case "toggle_tool_result":
      return updateToolRow(state, action.toolCallId, (row) => ({ resultExpanded: !row.resultExpanded }));
    case "toggle_tool_result_at_index":
      return updateToolRowAtVisibleIndex(state, action.index, (row) => ({ resultExpanded: !row.resultExpanded }));
    case "steer_queued":
      return appendRow(state, { kind: "steering", text: action.text });
    case "next_user_message_display":
      return { ...state, nextUserMessageDisplayText: action.text };
    case "clear_next_user_message_display":
      return clearNextUserMessageDisplay(state);
    case "clear_rows":
      return clearNextUserMessageDisplay({ ...state, rows: [], latestTodos: [] });
    case "system_message":
      return appendRow(state, { kind: "system", text: action.text, tone: action.tone });
    default:
      return state;
  }
}

export function selectLatestTodos(state: TuiViewState): TodoViewItem[] {
  return state.latestTodos;
}

export function isFoldableToolRow(row: TuiRow): row is Extract<TuiRow, { kind: "tool" }> {
  return row.kind === "tool" && row.toolName !== "write_file" && Boolean(row.result || row.fullResult);
}

function handleMessageStart(state: TuiViewState, message: TuiMessageLike): TuiViewState {
  if (!isObject(message)) {
    return state;
  }

  if (message.role === "user") {
    const text = state.nextUserMessageDisplayText ?? textFromMessage(message);
    return appendRow(clearNextUserMessageDisplay(state), { kind: "user", text });
  }

  if (message.role === "assistant" && state.rows[state.rows.length - 1]?.kind !== "assistant") {
    return appendRow(state, { kind: "assistant", text: "" });
  }

  return state;
}

function handleMessageUpdate(state: TuiViewState, event: TuiAssistantMessageEventLike): TuiViewState {
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

function handleMessageEnd(state: TuiViewState, message: TuiMessageLike): TuiViewState {
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
  patch:
    | Partial<Extract<TuiRow, { kind: "tool" }>>
    | ((row: Extract<TuiRow, { kind: "tool" }>) => Partial<Extract<TuiRow, { kind: "tool" }>>),
): TuiViewState {
  return {
    ...state,
    rows: state.rows.map((row) =>
      row.kind === "tool" && row.toolCallId === toolCallId
        ? { ...row, ...(typeof patch === "function" ? patch(row) : patch) }
        : row,
    ),
  };
}

function updateToolRowAtVisibleIndex(
  state: TuiViewState,
  index: number,
  patch:
    | Partial<Extract<TuiRow, { kind: "tool" }>>
    | ((row: Extract<TuiRow, { kind: "tool" }>) => Partial<Extract<TuiRow, { kind: "tool" }>>),
): TuiViewState {
  if (!Number.isInteger(index) || index < 1) {
    return state;
  }

  let visibleIndex = 0;
  return {
    ...state,
    rows: state.rows.map((row) => {
      if (!isFoldableToolRow(row)) {
        return row;
      }

      visibleIndex += 1;
      return visibleIndex === index
        ? { ...row, ...(typeof patch === "function" ? patch(row) : patch) }
        : row;
    }),
  };
}

function appendRow(state: TuiViewState, row: TuiRow): TuiViewState {
  return { ...state, rows: [...state.rows, row] };
}

function rowFromResumedMessage(message: TuiMessageLike): TuiRow[] {
  if (!isObject(message)) {
    return [];
  }

  if (message.role === "user") {
    const text = textFromMessage(message);
    return text ? [{ kind: "user", text }] : [];
  }

  if (message.role === "assistant") {
    if (
      (message.stopReason === "error" || message.stopReason === "aborted") &&
      typeof message.errorMessage === "string"
    ) {
      return [{ kind: "assistant", text: message.errorMessage, error: true }];
    }

    const text = textFromMessage(message);
    return text ? [{ kind: "assistant", text }] : [];
  }

  if (message.role === "toolResult" && typeof message.toolCallId === "string" && typeof message.toolName === "string") {
    return [
      {
        kind: "tool",
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        title: summarizeToolTitle(message.toolName),
        detail: "",
        status: message.isError ? "error" : "ok",
        ...formatToolResultView(message),
      },
    ];
  }

  return [];
}

function clearNextUserMessageDisplay(state: TuiViewState): TuiViewState {
  const { nextUserMessageDisplayText: _nextUserMessageDisplayText, ...rest } = state;
  return rest;
}

function formatToolResultView(result: unknown): Pick<
  Extract<TuiRow, { kind: "tool" }>,
  "result" | "fullResult" | "resultTruncated"
> {
  const preview = formatToolResult(result, TOOL_RESULT_PREVIEW_CHARS);
  const fullResult = formatToolResult(result, TOOL_RESULT_EXPANDED_CHARS);

  return {
    result: preview,
    fullResult,
    resultTruncated: preview !== fullResult,
  };
}

function textFromMessage(message: Record<string, unknown>): string {
  if (typeof message.content === "string") {
    return message.content;
  }

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
