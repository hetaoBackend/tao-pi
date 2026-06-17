import { describe, expect, it } from "vitest";
import { createInitialTuiViewState, reduceTuiViewState, selectLatestTodos } from "../../../src/cli/tui/view-state.js";

describe("tui view state", () => {
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

  it("records steering rows separately from prompt rows", () => {
    const state = reduceTuiViewState(createInitialTuiViewState(), {
      type: "steer_queued",
      text: "focus on tests",
    });

    expect(state.rows).toEqual([{ kind: "steering", text: "focus on tests" }]);
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
});
