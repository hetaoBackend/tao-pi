import { renderToString } from "ink";
import React from "react";
import { describe, expect, it } from "vitest";
import { CommandList } from "../../../src/cli/tui/components/command-list.js";
import { Footer } from "../../../src/cli/tui/components/footer.js";
import { Header, TAOPI_LOGO_LINES } from "../../../src/cli/tui/components/header.js";
import { MessageHistory } from "../../../src/cli/tui/components/message-history.js";
import { StreamingIndicator } from "../../../src/cli/tui/components/streaming-indicator.js";
import { TodoPanel } from "../../../src/cli/tui/components/todo-panel.js";

describe("tui components", () => {
  it("renders the header and footer session chrome", () => {
    const header = renderToString(
      <Header
        appVersion="0.1.0"
        modelLabel="gpt-4.1-mini"
        sessionId="session-123"
        workspaceRoot="/tmp/project"
        toolCount={4}
        pluginCount={2}
        projectContextCount={1}
      />,
    );
    const footer = renderToString(
      <Footer
        modelLabel="gpt-4.1-mini"
        messageCount={3}
        toolCount={4}
        pluginCount={2}
      />,
    );

    expect(TAOPI_LOGO_LINES.join("\n")).toContain("|__   __|");
    expect(TAOPI_LOGO_LINES.join("\n")).toContain("\\___/");
    expect(TAOPI_LOGO_LINES.join("\n")).not.toContain("☯");
    expect(header).toContain(TAOPI_LOGO_LINES[0]);
    expect(header).toContain("TaoPi v0.1.0");
    expect(header).toContain("gpt-4.1-mini");
    expect(header).not.toContain("openai/gpt-4.1-mini");
    expect(header).toContain("/tmp/project");
    expect(header).toContain("session-123");
    expect(header).not.toContain("(new)");
    expect(header).not.toContain("undefined");
    expect(footer).toContain("messages 3");
    expect(footer).toContain("gpt-4.1-mini");
    expect(footer).not.toContain("mode");
    expect(footer).not.toContain("| new |");
    expect(footer).not.toContain("undefined");
  });

  it("renders command picker rows", () => {
    const output = renderToString(
      <CommandList
        selectedIndex={1}
        commands={[
          { name: "help", description: "Show commands.", source: "builtin" },
          { name: "review", description: "Review changes.", source: "plugin" },
        ]}
      />,
    );

    expect(output).toContain("Commands");
    expect(output).toContain("/help");
    expect(output).toContain("/review");
  });

  it("renders message, tool, and steering rows", () => {
    const output = renderToString(
      <MessageHistory
        rows={[
          { kind: "user", text: "hello" },
          { kind: "assistant", text: "hi there" },
          {
            kind: "tool",
            toolCallId: "call-1",
            toolName: "bash",
            title: "Run command",
            detail: "bun run test",
            result: "ok",
            status: "ok",
          },
          { kind: "steering", text: "focus on tests" },
        ]}
      />,
    );

    expect(output).toContain("hello");
    expect(output).toContain("hi there");
    expect(output).toContain("Run command");
    expect(output).toContain("focus on tests");
  });

  it("renders assistant markdown as clean conversation text", () => {
    const output = renderToString(
      <MessageHistory
        rows={[
          {
            kind: "assistant",
            text: [
              "## Fix",
              "",
              "One line - pass `onPreCompactionFlush` to `runCompaction()`.",
              "- **Without** the fix: fails - `expected [] to have a length of 1`",
              "- **With** the fix: passes",
            ].join("\n"),
          },
        ]}
      />,
    );

    expect(output).toContain("Fix");
    expect(output).toContain("One line - pass onPreCompactionFlush to runCompaction().");
    expect(output).toContain("- Without the fix: fails - expected [] to have a length of 1");
    expect(output).toContain("- With the fix: passes");
    expect(output).not.toContain("##");
    expect(output).not.toContain("`");
    expect(output).not.toContain("**");
  });

  it("renders collapsed or expanded tool results", () => {
    const rows = [
      {
        kind: "tool" as const,
        toolCallId: "call-1",
        toolName: "bash",
        title: "Run command",
        detail: "printf",
        result: "abcdefghij...",
        fullResult: "abcdefghijklmnopqrstuvwxyz",
        resultTruncated: true,
        status: "ok" as const,
      },
    ];

    const collapsed = renderToString(<MessageHistory rows={rows} toolResultsExpanded={false} />);
    const expanded = renderToString(<MessageHistory rows={rows} toolResultsExpanded />);

    expect(collapsed).toContain("abcdefghij...");
    expect(collapsed).not.toContain("klmnopqrstuvwxyz");
    expect(expanded).toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("renders active todos and hides completed idle todos", () => {
    const active = renderToString(
      <TodoPanel
        streaming
        todos={[
          { content: "done", status: "completed" },
          { content: "ship tui", status: "in_progress" },
        ]}
      />,
    );
    const hidden = renderToString(<TodoPanel streaming={false} todos={[{ content: "done", status: "completed" }]} />);

    expect(active).toContain("Tasks");
    expect(active).toContain("✅");
    expect(active).toContain("ship tui");
    expect(hidden).toBe("");
  });

  it("renders streaming indicator only while active", () => {
    expect(renderToString(<StreamingIndicator streaming={false} />)).toBe("");

    const output = renderToString(<StreamingIndicator streaming nextTodo="ship tui" />);

    expect(output).toContain("Working");
    expect(output).toContain("ship tui");
  });

  it("renders alternate working symbols for animation frames", () => {
    const lit = renderToString(<StreamingIndicator streaming frame={0} />);
    const dimmed = renderToString(<StreamingIndicator streaming frame={1} />);

    expect(lit).toContain("*");
    expect(dimmed).not.toContain("*");
    expect(dimmed).toContain("Working");
  });
});
