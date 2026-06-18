import { describe, expect, it } from "vitest";
import { renderCliHelp, renderSessionSummary, renderWelcome } from "../../src/cli/ui.js";

describe("cli ui", () => {
  it("renders a compact Claude-style welcome panel with the active context", () => {
    const text = renderWelcome({
      cwd: "/Users/taohe/Documents/tao-pi",
      modelLabel: "deepseek/ark-code-latest",
      sessionId: "session-123",
      sessionMode: "resumed",
      historyMessages: 4,
      dbPath: ".pi-sessions.sqlite",
      workspaceRoot: "/Users/taohe/Documents/tao-pi",
      toolNames: ["todo_read", "todo_write", "list_files", "bash"],
      pluginIds: ["todo"],
      projectContextFiles: ["AGENTS.md", "CLAUDE.md"],
      debug: false,
    });

    expect(text).toContain("TaoPi");
    expect(text).toContain("cwd      /Users/taohe/Documents/tao-pi");
    expect(text).toContain("model    deepseek/ark-code-latest");
    expect(text).toContain("session  session-123 (resumed, 4 messages)");
    expect(text).toContain("tools    todo_read, todo_write, list_files, bash");
    expect(text).toContain("plugins  todo");
    expect(text).toContain("context  AGENTS.md, CLAUDE.md");
    expect(text).toContain("Type /help for commands, /exit to quit.");
    expect(text).not.toContain("hook");
  });

  it("renders session details separately for /session", () => {
    expect(
      renderSessionSummary({
        sessionId: "session-123",
        sessionMode: "new",
        historyMessages: 0,
        dbPath: ".pi-sessions.sqlite",
        workspaceRoot: "/tmp/project",
        modelLabel: "openai/gpt-4.1-mini",
        toolNames: ["list_files", "read_file"],
        pluginIds: [],
        projectContextFiles: [],
      }),
    ).toBe(
      [
        "Session",
        "  id       session-123",
        "  mode     new",
        "  history  0 messages",
        "  model    openai/gpt-4.1-mini",
        "  db       .pi-sessions.sqlite",
        "  tools    list_files, read_file",
        "  plugins  none",
        "  context  none",
        "  root     /tmp/project",
        "",
      ].join("\n"),
    );
  });

  it("renders discoverable help with Claude-style aliases", () => {
    const text = renderCliHelp("tsx src/index.ts", [
      { name: "research", description: "Research a topic." },
      { name: "review", description: "Review changes." },
    ]);

    expect(text).toContain("Usage: tsx src/index.ts [options] [prompt]");
    expect(text).toContain("-p, --print");
    expect(text).toContain("-r, --resume [session-id]");
    expect(text).toContain("-c, --continue");
    expect(text).toContain("--model <model>");
    expect(text).toContain("FIRECRAWL_API_KEY");
    expect(text).toContain("/session");
    expect(text).toContain("Plugin commands:");
    expect(text).toContain("  /research                    Research a topic.");
    expect(text).toContain("  /review                      Review changes.");
  });
});
