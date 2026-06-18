import { describe, expect, it } from "vitest";
import { TOOL_RESULT_PREVIEW_CHARS } from "../../../src/cli/tui/message-format.js";
import { createInitialTuiViewState, reduceTuiViewState, selectLatestTodos } from "../../../src/cli/tui/view-state.js";

describe("tui view state", () => {
  it("creates visible rows from resumed text messages", () => {
    const state = createInitialTuiViewState([
      { role: "user", content: "hello from disk", timestamp: 1 },
      {
        role: "assistant",
        content: [
          { type: "text", text: "hello back" },
          { type: "tool-call", toolName: "bash" },
          { type: "text", text: "second paragraph" },
        ],
        timestamp: 2,
      },
    ]);

    expect(state.rows).toEqual([
      { kind: "user", text: "hello from disk" },
      { kind: "assistant", text: "hello back\nsecond paragraph" },
    ]);
  });

  it("creates tool rows from resumed tool result messages", () => {
    const state = createInitialTuiViewState([
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "bash",
        content: [{ type: "text", text: "command output" }],
        isError: false,
        timestamp: 1,
      },
    ]);

    expect(state.rows).toMatchObject([
      {
        kind: "tool",
        toolCallId: "call-1",
        toolName: "bash",
        title: "Run command",
        result: "command output",
        fullResult: "command output",
        status: "ok",
      },
    ]);
  });

  it("streams assistant text into one assistant row", () => {
    let state = createInitialTuiViewState();

    state = reduceTuiViewState(state, { type: "agent_start" });
    state = reduceTuiViewState(state, {
      type: "message_start",
      message: { role: "assistant", content: [] },
    });
    state = reduceTuiViewState(state, {
      type: "message_update",
      message: { role: "assistant", content: [] },
      assistantMessageEvent: { type: "text_delta", delta: "hello" },
    });
    state = reduceTuiViewState(state, {
      type: "message_update",
      message: { role: "assistant", content: [] },
      assistantMessageEvent: { type: "text_delta", delta: " world" },
    });
    state = reduceTuiViewState(state, { type: "agent_end", messages: [] });

    expect(state.streaming).toBe(false);
    expect(state.rows).toMatchObject([{ kind: "assistant", text: "hello world" }]);
  });

  it("records tool cards and extracts latest todos", () => {
    let state = createInitialTuiViewState();

    state = reduceTuiViewState(state, {
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "todo_write",
      args: { todos: [{ content: "ship tui", status: "in_progress" }] },
    });
    state = reduceTuiViewState(state, {
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "todo_write",
      isError: false,
      result: {
        content: [{ type: "text", text: "Updated todo list" }],
        details: { todos: [{ content: "ship tui", status: "in_progress" }] },
      },
    });

    expect(state.rows).toMatchObject([{ kind: "tool", toolName: "todo_write", status: "ok" }]);
    expect(selectLatestTodos(state)).toEqual([{ content: "ship tui", status: "in_progress" }]);
  });

  it("keeps collapsed and expanded tool result text", () => {
    let state = createInitialTuiViewState();
    const previewText = "a".repeat(TOOL_RESULT_PREVIEW_CHARS);
    const fullText = `${previewText}tail`;

    state = reduceTuiViewState(state, {
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "bash",
      args: { command: "printf" },
    });
    state = reduceTuiViewState(state, {
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "bash",
      isError: false,
      result: {
        content: [{ type: "text", text: fullText }],
      },
    });

    expect(state.toolResultsExpanded).toBe(false);
    expect(state.rows).toMatchObject([
      {
        kind: "tool",
        result: `${previewText}...`,
        fullResult: fullText,
        resultTruncated: true,
      },
    ]);

    expect(reduceTuiViewState(state, { type: "toggle_tool_results" }).toolResultsExpanded).toBe(true);
  });

  it("toggles one tool result at a time", () => {
    let state = createInitialTuiViewState();

    state = reduceTuiViewState(state, {
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "bash",
      args: { command: "printf one" },
    });
    state = reduceTuiViewState(state, {
      type: "tool_execution_start",
      toolCallId: "call-2",
      toolName: "bash",
      args: { command: "printf two" },
    });

    const expanded = reduceTuiViewState(state, { type: "toggle_tool_result", toolCallId: "call-1" });

    expect(expanded.rows).toMatchObject([
      { kind: "tool", toolCallId: "call-1", resultExpanded: true },
      { kind: "tool", toolCallId: "call-2" },
    ]);
    expect(expanded.rows[1]).not.toHaveProperty("resultExpanded", true);
    expect(reduceTuiViewState(expanded, { type: "toggle_tool_result", toolCallId: "call-1" }).rows).toMatchObject([
      { kind: "tool", toolCallId: "call-1", resultExpanded: false },
      { kind: "tool", toolCallId: "call-2" },
    ]);
  });

  it("toggles one foldable tool result by visible number", () => {
    let state = createInitialTuiViewState();

    state = reduceTuiViewState(state, {
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "bash",
      args: { command: "printf one" },
    });
    state = reduceTuiViewState(state, {
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "bash",
      isError: false,
      result: { content: [{ type: "text", text: "one output" }] },
    });
    state = reduceTuiViewState(state, {
      type: "tool_execution_start",
      toolCallId: "call-2",
      toolName: "bash",
      args: { command: "printf two" },
    });
    state = reduceTuiViewState(state, {
      type: "tool_execution_end",
      toolCallId: "call-2",
      toolName: "bash",
      isError: false,
      result: { content: [{ type: "text", text: "two output" }] },
    });

    const expanded = reduceTuiViewState(state, { type: "toggle_tool_result_at_index", index: 2 });

    expect(expanded.rows).toMatchObject([
      { kind: "tool", toolCallId: "call-1" },
      { kind: "tool", toolCallId: "call-2", resultExpanded: true },
    ]);
    expect(expanded.rows[0]).not.toHaveProperty("resultExpanded", true);
  });

  it("records steering rows separately from prompt rows", () => {
    const state = reduceTuiViewState(createInitialTuiViewState(), {
      type: "steer_queued",
      text: "focus on tests",
    });

    expect(state.rows).toEqual([{ kind: "steering", text: "focus on tests" }]);
  });

  it("uses an explicit display value for the next user message", () => {
    let state = createInitialTuiViewState();

    state = reduceTuiViewState(state, {
      type: "next_user_message_display",
      text: "/review focus diff",
    });
    state = reduceTuiViewState(state, {
      type: "message_start",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              'Use the "review" skill for this request.',
              'First call skill_read with name "review" and follow the loaded SKILL.md instructions before answering.',
              "User request: focus diff",
            ].join("\n"),
          },
        ],
      },
    });

    expect(state.rows).toEqual([{ kind: "user", text: "/review focus diff" }]);
    expect(state.nextUserMessageDisplayText).toBeUndefined();
  });

  it("surfaces assistant error endings as error rows", () => {
    const state = reduceTuiViewState(createInitialTuiViewState(), {
      type: "message_end",
      message: {
        role: "assistant",
        content: [],
        stopReason: "error",
        errorMessage: "model failed",
      },
    });

    expect(state.rows).toEqual([{ kind: "assistant", text: "model failed", error: true }]);
  });

  it("clears visible rows without changing streaming state", () => {
    const withRow = reduceTuiViewState({ ...createInitialTuiViewState(), streaming: true }, {
      type: "system_message",
      text: "hello",
    });

    expect(reduceTuiViewState(withRow, { type: "clear_rows" })).toEqual({
      streaming: true,
      toolResultsExpanded: false,
      rows: [],
      latestTodos: [],
    });
  });
});
