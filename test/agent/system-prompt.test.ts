import { describe, expect, it } from "vitest";
import { buildSystemPrompt, formatPromptDate } from "../../src/agent/system-prompt.js";

describe("system prompt", () => {
  it("formats the current date in the configured timezone", () => {
    expect(formatPromptDate(new Date("2026-06-16T18:30:00.000Z"), "Asia/Shanghai")).toBe("2026-06-17");
  });

  it("appends the current date as the final prompt section", () => {
    const prompt = buildSystemPrompt({
      now: new Date("2026-06-17T07:00:00.000Z"),
      timeZone: "Asia/Shanghai",
    });

    expect(prompt).toContain("general-purpose agent");
    expect(prompt).toContain("strong software engineering capabilities");
    expect(prompt).not.toContain("coding agent");
    expect(prompt).toContain("## Tool Use");
    expect(prompt).toContain("Use the same care for research, writing, analysis, planning, and operations tasks");
    expect(prompt).toContain("Prefer dedicated file and search tools over bash");
    expect(prompt).toContain("file_path:line_number");
    expect(prompt).toContain("web_search");
    expect(prompt).toContain("web_fetch");
    expect(prompt).toContain("Project context is injected");
    expect(prompt).not.toContain("project_context");
    expect(prompt).toContain("list_files");
    expect(prompt).toContain("list_files with pattern");
    expect(prompt).toContain("search_files");
    expect(prompt).toContain("context_lines");
    expect(prompt).toContain("regex");
    expect(prompt).toContain("case_sensitive");
    expect(prompt).toContain("file_info");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("binary");
    expect(prompt).toContain("directories");
    expect(prompt).toContain("start_line, max_lines, and show_line_numbers");
    expect(prompt).toContain("show_line_numbers");
    expect(prompt).toContain("edit_file");
    expect(prompt).toContain("multi_edit_file");
    expect(prompt).toContain("edit_file and multi_edit_file require read_file first");
    expect(prompt).toContain("old_text must appear in read_file output");
    expect(prompt).toContain("write_file");
    expect(prompt).toContain("read_file before overwriting");
    expect(prompt).toContain("bash");
    expect(prompt).toContain("Bash commands");
    expect(prompt).toContain("cwd");
    expect(prompt).toContain("max_output_chars");
    expect(prompt).not.toContain("todo_read");
    expect(prompt).not.toContain("todo_write");
    expect(prompt).toContain("## Work Habits");
    expect(prompt).toContain("After changing code, run relevant tests or type checks");
    expect(prompt).toContain("Before overwriting files or running high-risk commands");
    expect(prompt).toContain("outward-facing commands such as git push");
    expect(prompt).not.toContain("## Coding Workflow");
    expect(prompt).toContain("## Dynamic Context");
    expect(prompt).not.toContain("## 工具使用");
    expect(prompt).not.toContain("## 动态上下文");
    expect(prompt.trimEnd().endsWith("Current date: 2026-06-17 (Asia/Shanghai).")).toBe(true);
    expect(prompt.indexOf("## Tool Use")).toBeLessThan(prompt.indexOf("## Dynamic Context"));
  });

  it("includes plugin guidance before project and dynamic context", () => {
    const prompt = buildSystemPrompt({
      now: new Date("2026-06-17T07:00:00.000Z"),
      timeZone: "Asia/Shanghai",
      pluginPromptSections: [
        "- todo: provides todo_read and todo_write for tracking multi-step work.",
      ],
      projectContext: [{ path: "AGENTS.md", content: "# Agents\nRun npm test.\n", truncated: false }],
    });

    expect(prompt).toContain("## Plugin Guidance");
    expect(prompt).toContain("todo_read");
    expect(prompt).toContain("todo_write");
    expect(prompt.indexOf("## Plugin Guidance")).toBeLessThan(prompt.indexOf("## Project Context"));
    expect(prompt.indexOf("## Project Context")).toBeLessThan(prompt.indexOf("## Dynamic Context"));
  });

  it("includes loaded project context before dynamic context", () => {
    const prompt = buildSystemPrompt({
      now: new Date("2026-06-17T07:00:00.000Z"),
      timeZone: "Asia/Shanghai",
      projectContext: [{ path: "AGENTS.md", content: "# Agents\nRun npm test.\n", truncated: false }],
    });

    expect(prompt).toContain("## Project Context");
    expect(prompt).toContain("### AGENTS.md");
    expect(prompt).toContain("Run npm test.");
    expect(prompt.indexOf("## Project Context")).toBeLessThan(prompt.indexOf("## Dynamic Context"));
  });
});
