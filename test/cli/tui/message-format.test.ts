import { describe, expect, it } from "vitest";
import {
  formatAssistantTextBlocks,
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

  it("formats assistant markdown into readable text blocks", () => {
    const blocks = formatAssistantTextBlocks(
      [
        "## Fix",
        "",
        "One line - pass `onPreCompactionFlush` to `runCompaction()`.",
        "- **Without** the fix: fails - `expected [] to have a length of 1`",
        "- **With** the fix: passes",
      ].join("\n"),
    );

    expect(blocks).toEqual([
      { kind: "heading", spans: [{ text: "Fix", style: "strong" }] },
      { kind: "blank" },
      {
        kind: "paragraph",
        spans: [
          { text: "One line - pass " },
          { text: "onPreCompactionFlush", style: "code" },
          { text: " to " },
          { text: "runCompaction()", style: "code" },
          { text: "." },
        ],
      },
      {
        kind: "listItem",
        spans: [
          { text: "Without", style: "strong" },
          { text: " the fix: fails - " },
          { text: "expected [] to have a length of 1", style: "code" },
        ],
      },
      {
        kind: "listItem",
        spans: [
          { text: "With", style: "strong" },
          { text: " the fix: passes" },
        ],
      },
    ]);
  });
});
