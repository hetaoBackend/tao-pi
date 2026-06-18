import { renderToString } from "ink";
import React from "react";
import { describe, expect, it } from "vitest";
import { CommandList } from "../../../src/cli/tui/components/command-list.js";
import { Footer } from "../../../src/cli/tui/components/footer.js";
import { Header } from "../../../src/cli/tui/components/header.js";
import { MessageHistory } from "../../../src/cli/tui/components/message-history.js";
import { StreamingIndicator } from "../../../src/cli/tui/components/streaming-indicator.js";
import { TodoPanel } from "../../../src/cli/tui/components/todo-panel.js";

describe("tui components", () => {
  it("renders the header and footer session chrome", () => {
    const header = renderToString(
      <Header
        modelLabel="openai/gpt-4.1-mini"
        sessionId="session-123"
        sessionMode="new"
        workspaceRoot="/tmp/project"
        toolCount={4}
        pluginCount={2}
        projectContextCount={1}
      />,
    );
    const footer = renderToString(
      <Footer
        modelLabel="openai/gpt-4.1-mini"
        sessionMode="new"
        messageCount={3}
        toolCount={4}
        pluginCount={2}
        inputMode="prompt"
      />,
    );

    expect(header).toContain("TaoPi");
    expect(header).toContain("openai/gpt-4.1-mini");
    expect(header).toContain("session-123");
    expect(footer).toContain("messages 3");
    expect(footer).toContain("mode prompt");
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
    expect(active).toContain("ship tui");
    expect(hidden).toBe("");
  });

  it("renders streaming indicator only while active", () => {
    expect(renderToString(<StreamingIndicator streaming={false} />)).toBe("");

    const output = renderToString(<StreamingIndicator streaming nextTodo="ship tui" />);

    expect(output).toContain("Working");
    expect(output).toContain("ship tui");
  });
});
