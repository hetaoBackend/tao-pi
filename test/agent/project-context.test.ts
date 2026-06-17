import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatProjectContext, loadProjectContext } from "../../src/agent/project-context.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), "learning-pi-project-context-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe("project context", () => {
  it("loads supported root context files in priority order", async () => {
    await writeFile(join(workspaceRoot, "CONTEXT.md"), "# Domain\nUse domain language.\n", "utf8");
    await writeFile(join(workspaceRoot, "CLAUDE.md"), "# Claude\nUse project conventions.\n", "utf8");
    await writeFile(join(workspaceRoot, "AGENTS.md"), "# Agents\nRun npm test.\n", "utf8");

    const context = await loadProjectContext({ workspaceRoot });

    expect(context).toEqual([
      { path: "AGENTS.md", content: "# Agents\nRun npm test.\n", truncated: false },
      { path: "CLAUDE.md", content: "# Claude\nUse project conventions.\n", truncated: false },
      { path: "CONTEXT.md", content: "# Domain\nUse domain language.\n", truncated: false },
    ]);
  });

  it("skips missing files and truncates oversized context files", async () => {
    await writeFile(join(workspaceRoot, "AGENTS.md"), "1234567890", "utf8");

    const context = await loadProjectContext({ workspaceRoot, maxCharsPerFile: 4 });

    expect(context).toEqual([{ path: "AGENTS.md", content: "1234", truncated: true }]);
  });

  it("formats context for prompt injection", () => {
    const text = formatProjectContext([
      { path: "AGENTS.md", content: "# Agents\nRun npm test.\n", truncated: false },
      { path: "CONTEXT.md", content: "# Domain", truncated: true },
    ]);

    expect(text).toBe(
      [
        "## Project Context",
        "The following content comes from project instruction files in the workspace. Current user messages have higher priority; if these files conflict with the current user request, follow the current user request.",
        "",
        "### AGENTS.md",
        "# Agents",
        "Run npm test.",
        "",
        "### CONTEXT.md",
        "# Domain",
        "[Content truncated]",
      ].join("\n"),
    );
  });
});
