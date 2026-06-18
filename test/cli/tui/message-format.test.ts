import { describe, expect, it } from "vitest";
import {
  formatToolArgs,
  formatToolResult,
  summarizeToolTitle,
  TOOL_RESULT_EXPANDED_CHARS,
} from "../../../src/cli/tui/message-format.js";

describe("tui message format", () => {
  it("summarizes known tool arguments", () => {
    expect(summarizeToolTitle("bash")).toBe("Run command");
    expect(formatToolArgs("bash", { command: "bun run test" })).toBe("bun run test");
    expect(formatToolArgs("read_file", { path: "src/index.ts" })).toBe("src/index.ts");
    expect(formatToolArgs("search_files", { query: "steer", path: "src" })).toBe("src :: steer");
  });

  it("formats text tool results and truncates long output", () => {
    const result = {
      content: [{ type: "text", text: "abcdefghijklmnopqrstuvwxyz" }],
      details: {},
    };

    expect(formatToolResult(result, 10)).toBe("abcdefghij...");
  });

  it("uses Infinity to make expanded tool results explicitly unbounded", () => {
    expect(TOOL_RESULT_EXPANDED_CHARS).toBe(Infinity);
  });

  it("formats todo_write result as progress summary", () => {
    const result = {
      content: [{ type: "text", text: "Updated todo list" }],
      details: {
        todos: [
          { content: "one", status: "completed" },
          { content: "two", status: "in_progress" },
          { content: "three", status: "pending" },
        ],
      },
    };

    expect(formatToolResult(result, 100)).toBe("Todos: 1 completed, 1 in progress, 1 pending");
  });
});
